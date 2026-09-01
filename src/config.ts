// ─────────────────────────────────────────────────────────────────────────────
//  Config — environment loading, constants, KB file loading
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

export const DEFAULT_MODEL = 'gpt-4o';
export const DEFAULT_MAX_STEPS = 15;
export const HISTORY_FILE = process.env.AGENT_HISTORY_FILE || 'chat_history.json';
export const TOKEN_GRAPH_FILE = process.env.AGENT_TOKEN_GRAPH_FILE || 'token_graph.json';

// ── Named Sessions ──────────────────────────────────────────────────────────
export const SESSIONS_DIR = process.env.AGENT_SESSIONS_DIR || 'sessions';
export const SESSIONS_INDEX_FILE = process.env.AGENT_SESSIONS_INDEX_FILE || 'sessions.json';
export const DEFAULT_SESSION = 'default';

/** Per-session chat history file path, e.g. sessions/<name>/chat_history.json */
export function sessionHistoryPath(name: string): string {
  return path.join(SESSIONS_DIR, name, 'chat_history.json');
}

export interface AppConfig {
  apiKey: string;
  model: string;
  maxSteps: number;
  yolo: boolean;
  knowledgeBase?: string;
  kbFile?: string;
}

export async function loadKnowledgeBase(kbFile: string): Promise<{ content: string; file: string } | null> {
  try {
    const content = await fs.readFile(kbFile, 'utf-8');
    console.log(chalk.green(`  ✅ Role loaded from: ${chalk.white(kbFile)}`));
    const preview = content.split('\n').slice(0, 5);
    console.log(chalk.dim('  ── Role Preview (first 5 lines) ──────────────────────'));
    for (const line of preview) {
      console.log(chalk.dim(`  │  ${line}`));
    }
    const totalLines = content.split('\n').length;
    if (totalLines > 5) {
      console.log(chalk.dim(`  │  ... (${totalLines} lines total)`));
    }
    console.log(chalk.dim('  ──────────────────────────────────────────────────────'));
    return { content, file: kbFile };
  } catch {
    console.log(chalk.red(`  ⚠️  File not found: ${kbFile}`));
    console.log(chalk.yellow('  ⚡ Continuing as a generic assistant.'));
    return null;
  }
}

// Context Limit Constants
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // ── Anthropic via SAP AI Core ──────────────────────────────────────────────
  'anthropic--claude-4-sonnet':   200_000,
  'anthropic--claude-4.5-haiku':  200_000,
  'anthropic--claude-4.5-opus':   200_000,
  'anthropic--claude-4.5-sonnet': 200_000,
  'anthropic--claude-4.6-opus':   200_000,
  'anthropic--claude-4.6-sonnet': 200_000,
  'anthropic--claude-4.7-opus':   200_000,
  'anthropic--claude-4.8-opus':   200_000,

  // ── Anthropic (direct) ────────────────────────────────────────────────────
  'claude-3-5-sonnet-20241022':   200_000,
  'claude-3-5-haiku-20241022':    200_000,
  'claude-3-opus-20240229':       200_000,
  'claude-3-haiku-20240307':      200_000,

  // ── Google Gemini ─────────────────────────────────────────────────────────
  'gemini-2.5-pro':           1_000_000,
  'gemini-2.5-flash':         1_000_000,
  'gemini-2.5-flash-lite':    1_000_000,
  'gemini-3.1-flash-lite':    1_000_000, // estimate — verify with provider
  'gemini-3.5-flash':         1_000_000, // estimate — verify with provider

  // ── OpenAI GPT ────────────────────────────────────────────────────────────
  'gpt-4.1':       1_000_000,
  'gpt-4.1-mini':  1_000_000,
  'gpt-5':           128_000, // estimate — verify with provider
  'gpt-5-mini':      128_000, // estimate — verify with provider
  'gpt-5.4':         128_000, // estimate — verify with provider
  'gpt-5.5':         128_000, // estimate — verify with provider
  'gpt-4o':          128_000,
  'gpt-4o-mini':     128_000,
  'gpt-4-turbo':     128_000,
};


export const DEFAULT_CONTEXT_LIMIT = 128_000;   // fallback when model is unknown
export const CONTEXT_GUARD_THRESHOLD = 0.80;     // trigger auto-compact at 80%


// LoadHistory Config Limit: If the history file has more than this number of messages, only the last N messages will be loaded. This helps to keep the conversation context manageable and prevents exceeding model context limits.
export const HISTORY_LOAD_LIMIT = 10;  // Load only the last 100 messages from history file

// ── Terminal pool constants ────────────────────────────────────────────────────
export const TERMINAL_SHELL         = process.env.SHELL || 'bash';
export const TERMINAL_MAX           = 8;          // max concurrent terminals
export const TERMINAL_CMD_TIMEOUT_MS = 120_000;   // per-command sentinel timeout (ms)
export const TERMINAL_BUFFER_LINES  = 2_000;      // ring-buffer size per terminal

export function getContextLimit(): number {
  const model = process.env.CLIC_MODEL ?? '';
  return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
}