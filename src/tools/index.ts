// ─────────────────────────────────────────────────────────────────────────────
//  Tool Registry — central router for all tools
//
//  To add a new tool:
//    1. Create src/tools/myTool.ts with `definition` and `execute()`
//    2. Import it here and add to the `tools` array
//    That's it — the registry wires definitions + routing automatically.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Import all tools ─────────────────────────────────────────────────────────
import * as readFile from './readFile.js';
import * as writeFile from './writeFile.js';
import * as appendFile from './appendFile.js';
import * as modifyFile from './modifyFile.js';
import * as listDir from './listDir.js';
import * as runCommand from './runCommand.js';
import * as searchFiles from './searchFiles.js';
import * as webSearch from './webSearch.js';

// ── Tool interface — every tool module must export these ─────────────────────
interface ToolModule {
  definition: ToolDefinition;
  execute: (input: any, confirm: ConfirmFn) => Promise<ToolResult>;
}

// ── Registry array — add new tools here ──────────────────────────────────────
const tools: ToolModule[] = [
  readFile,
  writeFile,
  appendFile,
  modifyFile,
  listDir,
  runCommand,
  searchFiles,
  webSearch,
];

// ── Build name → module lookup map ───────────────────────────────────────────
const toolMap = new Map<string, ToolModule>(
  tools.map(t => [t.definition.name, t]),
);

// ── Public API ───────────────────────────────────────────────────────────────

/** Get all tool definitions to send to the Gemini API */
export function getToolDefinitions(): ToolDefinition[] {
  return tools.map(t => t.definition);
}

/** Execute a tool by name */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return { output: `Unknown tool: ${name}`, isError: true };
  }
  return tool.execute(input, confirm);
}

/** Get the list of registered tool names */
export function getToolNames(): string[] {
  return tools.map(t => t.definition.name);
}

// ── Re-export shared types ───────────────────────────────────────────────────
export type { ConfirmFn, ToolResult } from './types.js';
