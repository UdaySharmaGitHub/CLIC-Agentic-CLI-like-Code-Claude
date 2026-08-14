// ─────────────────────────────────────────────────────────────────────────────
//  Session index manager — owns sessions.json and the named-session lifecycle
//
//  Layout:
//    sessions/<name>/chat_history.json   (per-session conversation)
//    sessions.json                       ({ active, sessions: SessionMeta[] })
//    token_graph.json                    (shared; session nodes keyed session_<name>)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  SESSIONS_DIR,
  SESSIONS_INDEX_FILE,
  DEFAULT_SESSION,
  HISTORY_FILE,
  TOKEN_GRAPH_FILE,
  sessionHistoryPath,
} from './config.js';
import { getGraph, saveGraph, getSessionNodeByName } from './knowledgeGraph.js';

export interface SessionMeta {
  name: string;
  createdAt: string;
  lastActiveAt: string;
}

interface SessionIndex {
  active: string;
  sessions: SessionMeta[];
}

// ── In-memory index (loaded once, mutated, persisted) ─────────────────────────
let index: SessionIndex = { active: DEFAULT_SESSION, sessions: [] };

const VALID_NAME = /^[A-Za-z0-9_-]+$/;

/** Node id for a session's Knowledge Graph node. */
export function sessionNodeId(name: string): string {
  return `session_${name}`;
}

/** Validate a session name; throws with a friendly message on failure. */
export function assertValidName(name: string): void {
  if (!name || !VALID_NAME.test(name)) {
    throw new Error(
      `Invalid session name "${name}". Use only letters, digits, dashes, and underscores.`,
    );
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function loadIndex(): Promise<void> {
  try {
    const data = await fs.readFile(SESSIONS_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data) as SessionIndex;
    if (parsed && Array.isArray(parsed.sessions)) {
      index = parsed;
    }
  } catch {
    // No index yet — leave defaults; migrateLegacy()/ensureSession() will populate.
  }
}

export async function saveIndex(): Promise<void> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    await fs.writeFile(SESSIONS_INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  } catch {
    // Silently fail — the session index is not critical.
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function listSessions(): SessionMeta[] {
  return index.sessions;
}

export function getActive(): string {
  return index.active;
}

export function hasSession(name: string): boolean {
  return index.sessions.some(s => s.name === name);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function setActive(name: string): Promise<void> {
  index.active = name;
  touch(name);
  await saveIndex();
}

/** Update lastActiveAt for a session (no-op if unknown). Does not persist by itself. */
export function touch(name: string): void {
  const meta = index.sessions.find(s => s.name === name);
  if (meta) meta.lastActiveAt = nowISO();
}

/** Create a new session directory + index entry. Throws on invalid/duplicate name. */
export async function createSession(name: string): Promise<SessionMeta> {
  assertValidName(name);
  if (hasSession(name)) {
    throw new Error(`Session "${name}" already exists.`);
  }
  await fs.mkdir(path.join(SESSIONS_DIR, name), { recursive: true });
  const meta: SessionMeta = { name, createdAt: nowISO(), lastActiveAt: nowISO() };
  index.sessions.push(meta);
  await saveIndex();
  return meta;
}

/** Ensure a session exists (create if missing); returns its meta. */
export async function ensureSession(name: string): Promise<SessionMeta> {
  if (hasSession(name)) {
    return index.sessions.find(s => s.name === name)!;
  }
  return createSession(name);
}

/** Rename a session: move its directory, update the index, and relabel its KG node. */
export async function renameSession(oldName: string, newName: string): Promise<void> {
  assertValidName(newName);
  if (!hasSession(oldName)) throw new Error(`Session "${oldName}" does not exist.`);
  if (hasSession(newName)) throw new Error(`Session "${newName}" already exists.`);

  // Move the per-session directory (best-effort — it may not exist yet).
  try {
    await fs.rename(path.join(SESSIONS_DIR, oldName), path.join(SESSIONS_DIR, newName));
  } catch {
    await fs.mkdir(path.join(SESSIONS_DIR, newName), { recursive: true });
  }

  // Update index entry + active pointer.
  const meta = index.sessions.find(s => s.name === oldName)!;
  meta.name = newName;
  meta.lastActiveAt = nowISO();
  if (index.active === oldName) index.active = newName;

  // Relabel the KG session node (id + properties.name) so /tokens stays consistent.
  const node = getSessionNodeByName(oldName);
  if (node) {
    const oldId = node.id;
    const newId = sessionNodeId(newName);
    node.id = newId;
    node.properties.name = newName;
    for (const edge of getGraph().edges) {
      if (edge.from === oldId) edge.from = newId;
      if (edge.to === oldId) edge.to = newId;
    }
  }

  await saveIndex();
}

/** Delete a session's directory and index entry. Refuses to delete the active session. */
export async function deleteSession(name: string): Promise<void> {
  if (!hasSession(name)) throw new Error(`Session "${name}" does not exist.`);
  if (index.active === name) {
    throw new Error(`Cannot delete the active session "${name}". Switch away first.`);
  }
  try {
    await fs.rm(path.join(SESSIONS_DIR, name), { recursive: true, force: true });
  } catch {
    // Directory may not exist — ignore.
  }

  // Remove KG node + all its edges so /tokens all-time totals stay accurate.
  const nodeId = sessionNodeId(name);
  const graph = getGraph();
  graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
  graph.edges = graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  await saveGraph(TOKEN_GRAPH_FILE);

  index.sessions = index.sessions.filter(s => s.name !== name);
  await saveIndex();
}

// ── Migration ─────────────────────────────────────────────────────────────────

/**
 * One-time migration: if a legacy root chat_history.json exists and no sessions
 * index is present yet, adopt it as the "default" session.
 */
export async function migrateLegacy(): Promise<void> {
  // If the index already has sessions, nothing to migrate.
  if (index.sessions.length > 0) return;

  // Seed a default session entry.
  await fs.mkdir(path.join(SESSIONS_DIR, DEFAULT_SESSION), { recursive: true });

  const defaultHistory = sessionHistoryPath(DEFAULT_SESSION);
  let migrated = false;
  try {
    // Only migrate when the legacy file exists and the default session file does not.
    await fs.access(HISTORY_FILE);
    try {
      await fs.access(defaultHistory);
    } catch {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      await fs.writeFile(defaultHistory, data, 'utf-8');
      migrated = true;
    }
  } catch {
    // No legacy history — fresh start.
  }

  index = {
    active: DEFAULT_SESSION,
    sessions: [{ name: DEFAULT_SESSION, createdAt: nowISO(), lastActiveAt: nowISO() }],
  };
  await saveIndex();

  if (migrated) {
    // eslint-disable-next-line no-console
    console.log(`  📦 Migrated existing history into session "${DEFAULT_SESSION}".`);
  }
}
