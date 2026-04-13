// ─────────────────────────────────────────────────────────────────────────────
//  Memory — chat history persistence (Gemini Content format)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import chalk from 'chalk';
import { HISTORY_FILE } from './config.js';

// ── Gemini-compatible message types ──────────────────────────────────────────

export type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface MessageParam {
  role: 'user' | 'model';
  parts: Part[];
}

let messages: MessageParam[] = [];

export function getMessages(): MessageParam[] {
  return messages;
}

export function pushMessage(msg: MessageParam): void {
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
