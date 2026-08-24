// ─────────────────────────────────────────────────────────────────────────────
//  Knowledge Graph — token consumption tracking
//
//  Graph schema:
//    Session -[HAS_TURN]->   Turn
//    Turn    -[USED_MODEL]-> Model  (singleton per model name)
//    Turn    -[CALLED_TOOL]-> Tool  (singleton per tool name, one edge per unique tool per turn)
//    Turn    -[HAS_USAGE]->  TokenUsage
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import { isEphemeral } from './privacy.js';

export type NodeType = 'session' | 'turn' | 'model' | 'tool' | 'token_usage';
export type EdgeType = 'HAS_TURN' | 'USED_MODEL' | 'CALLED_TOOL' | 'HAS_USAGE';

export interface KGNode {
  id: string;
  type: NodeType;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface KGEdge {
  from: string;
  to: string;
  type: EdgeType;
}

export interface KnowledgeGraph {
  nodes: KGNode[];
  edges: KGEdge[];
}

export interface TokenSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  turnCount: number;
}

let graph: KnowledgeGraph = { nodes: [], edges: [] };

// ── Node / Edge mutations ────────────────────────────────────────────────────

export function addNode(node: KGNode): KGNode {
  const existing = graph.nodes.find(n => n.id === node.id);
  if (existing) {
    Object.assign(existing.properties, node.properties);
  } else {
    graph.nodes.push(node);
  }
  return node;
}

export function addEdge(edge: KGEdge): void {
  const exists = graph.edges.some(
    e => e.from === edge.from && e.to === edge.to && e.type === edge.type,
  );
  if (!exists) graph.edges.push(edge);
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function getGraph(): KnowledgeGraph {
  return graph;
}

export function getNodeById(id: string): KGNode | undefined {
  return graph.nodes.find(n => n.id === id);
}

export function getNeighbors(nodeId: string, edgeType?: EdgeType): KGNode[] {
  return graph.edges
    .filter(e => e.from === nodeId && (!edgeType || e.type === edgeType))
    .map(e => getNodeById(e.to))
    .filter(Boolean) as KGNode[];
}

export function getAllSessionNodes(): KGNode[] {
  return graph.nodes.filter(n => n.type === 'session');
}

/** Find a session node by its human-readable name (properties.name). */
export function getSessionNodeByName(name: string): KGNode | undefined {
  return graph.nodes.find(n => n.type === 'session' && n.properties.name === name);
}

// ── Query helpers ────────────────────────────────────────────────────────────

// ── Get Session Token by Model ────────────────────────────────────────────────────────────

export function getSessionTokensByModel(sessionId: string): Record<string, { promptTokens: number; completionTokens: number }> {
  const turns = getNeighbors(sessionId, 'HAS_TURN');
  const byModel: Record<string, { promptTokens: number; completionTokens: number }> = {};
  for (const turn of turns) {
    const modelNode = getNeighbors(turn.id, 'USED_MODEL')[0];
    const modelName = modelNode?.properties.name as string | undefined;
    if (!modelName) continue;
    const usage = getNeighbors(turn.id, 'HAS_USAGE')[0];
    if (!usage) continue;
    byModel[modelName] ??= { promptTokens: 0, completionTokens: 0 };
    byModel[modelName].promptTokens     += (usage.properties.promptTokens as number)     || 0;
    byModel[modelName].completionTokens += (usage.properties.completionTokens as number) || 0;
  }
  return byModel;
}

export function getGlobalTokensByModel(): Record<string, { promptTokens: number; completionTokens: number }> {
  const sessions = getAllSessionNodes();
  const byModel: Record<string, { promptTokens: number; completionTokens: number }> = {};
  for (const s of sessions) {
    for (const [model, tokens] of Object.entries(getSessionTokensByModel(s.id))) {
      byModel[model] ??= { promptTokens: 0, completionTokens: 0 };
      byModel[model].promptTokens     += tokens.promptTokens;
      byModel[model].completionTokens += tokens.completionTokens;
    }
  }
  return byModel;
}

export function getSessionTokenSummary(sessionId: string): TokenSummary {
  const turns = getNeighbors(sessionId, 'HAS_TURN');
  let promptTokens = 0, completionTokens = 0, totalTokens = 0;
  for (const turn of turns) {
    for (const usage of getNeighbors(turn.id, 'HAS_USAGE')) {
      promptTokens  += (usage.properties.promptTokens as number)     || 0;
      completionTokens += (usage.properties.completionTokens as number) || 0;
      totalTokens   += (usage.properties.totalTokens as number)      || 0;
    }
  }
  return { promptTokens, completionTokens, totalTokens, turnCount: turns.length };
}

export function getGlobalTokenSummary(): TokenSummary {
  const sessions = getAllSessionNodes();
  const acc: TokenSummary = { promptTokens: 0, completionTokens: 0, totalTokens: 0, turnCount: 0 };
  for (const s of sessions) {
    const sm = getSessionTokenSummary(s.id);
    acc.promptTokens     += sm.promptTokens;
    acc.completionTokens += sm.completionTokens;
    acc.totalTokens      += sm.totalTokens;
    acc.turnCount        += sm.turnCount;
  }
  return acc;
}

/** Returns the set of unique tool names used in a session, with call counts. */
export function getSessionToolUsage(sessionId: string): Record<string, number> {
  const turns = getNeighbors(sessionId, 'HAS_TURN');
  const counts: Record<string, number> = {};
  for (const turn of turns) {
    for (const tool of getNeighbors(turn.id, 'CALLED_TOOL')) {
      const name = tool.properties.name as string;
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function loadGraph(file: string): Promise<void> {
  try {
    const data = await fs.readFile(file, 'utf-8');
    graph = JSON.parse(data) as KnowledgeGraph;
  } catch {
    graph = { nodes: [], edges: [] };
  }
}

export async function saveGraph(file: string): Promise<void> {
  if (isEphemeral()) return; // privacy mode — keep the token graph in memory only
  try {
    await fs.writeFile(file, JSON.stringify(graph, null, 2), 'utf-8');
  } catch {
    // silently fail — token graph is not critical
  }
}
