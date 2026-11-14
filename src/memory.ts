// ─────────────────────────────────────────────────────────────────────────────
//  Memory — chat history persistence (OpenAI-compatible message format)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { historyFile } from './config.js';
import { isEphemeral } from './privacy.js';

// ── OpenAI-compatible message types (HyperSpace AI) ───────

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

let messages: ChatMessage[] = [];

// Active history file — lazily resolves to the per-project default (historyFile())
// on first use unless pointed at a specific file via setHistoryFile(). Lazy so
// importing this module never snapshots process.cwd() at load time.
let activeHistoryFile: string | null = null;

/** Point load/save at a specific history file (used by Named Sessions). */
export function setHistoryFile(filePath: string): void {
  activeHistoryFile = filePath;
}

/** The history file currently backing load/save. */
export function getHistoryFile(): string {
  return activeHistoryFile ?? historyFile();
}

export function getMessages(): ChatMessage[] {
  return messages;
}

export function pushMessage(msg: ChatMessage): void {
  messages.push(msg);
}

export function popMessage(): ChatMessage | undefined {
  return messages.pop();
}

export function clearMessages(): void {
  messages = [];
}

export function messageCount(): number {
  return messages.length;
}

export async function loadHistory(limit?: number): Promise<void> {
  const file = getHistoryFile();
  try {
    const data = await fs.readFile(file, 'utf-8');
    const all: ChatMessage[] = JSON.parse(data);
    messages = limit && all.length > limit ? all.slice(-limit) : all;
    const note = limit && all.length > limit ? ` (last ${limit} of ${all.length})` : '';
    console.log(chalk.cyan(`  📂 Loaded ${messages.length} messages from ${file}${note}`));
  } catch {
    messages = [];
    console.log(chalk.cyan('  🆕 Starting fresh conversation.'));
  }
}


export async function saveHistory(): Promise<void> {
  if (isEphemeral()) return; // privacy mode — keep history in memory only
  const file = getHistoryFile();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(messages, null, 2), 'utf-8');
  } catch {
    // Silently fail — history is not critical
  }
}

/** Remove messages from the end until the last user message is at the tail (keeps it). */
export function trimToLastUserMessage(): void {
  while (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
    messages.pop();
  }
}
