// ─────────────────────────────────────────────────────────────────────────────
//  Memory — chat history persistence (OpenAI-compatible message format)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import chalk from 'chalk';
import { HISTORY_FILE } from './config.js';

// ── OpenAI-compatible message types (used by SAP AI SDK orchestration) ───────

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

export function getMessages(): ChatMessage[] {
  return messages;
}

export function pushMessage(msg: ChatMessage): void {
  messages.push(msg);
}

export function clearMessages(): void {
  messages = [];
}

export function messageCount(): number {
  return messages.length;
}

export async function loadHistory(): Promise<void> {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    messages = JSON.parse(data);
    console.log(chalk.cyan(`  📂 Loaded ${messages.length} messages from ${HISTORY_FILE}`));
  } catch {
    messages = [];
    console.log(chalk.cyan('  🆕 Starting fresh conversation.'));
  }
}

export async function saveHistory(): Promise<void> {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(messages, null, 2), 'utf-8');
  } catch {
    // Silently fail — history is not critical
  }
}
