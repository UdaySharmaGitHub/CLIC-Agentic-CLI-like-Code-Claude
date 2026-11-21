// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — /ping health check command
//
//  Checks API endpoint reachability and measures round-trip latency.
//  Usage: /ping
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { createClient } from '../openai.js';
import type { SlashCommand } from './types.js';

// ── Core logic (also exported for startup ping in index.ts) ──────────────────

/**
 * Sends a minimal non-streaming request and returns a human-readable result.
 * On success: "✅ API reachable — model: <model> — latency: <N>ms"
 * On error:   "❌ ..." with a hint based on the HTTP status code
 */
export async function runPing(client: OpenAI, model: string): Promise<string> {
  const start = Date.now();
  try {
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_completion_tokens: 5,
    });
    const latency = Date.now() - start;
    return `✅ API reachable — model: ${model} — latency: ${latency}ms`;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    const message = (err as { message?: string }).message ?? String(err);

    if (status === 401 || status === 403) {
      return `❌ API unreachable — ${status} Unauthorized — check API_KEY in .env`;
    }
    if (status === 404) {
      return `❌ API unreachable — 404 Not Found — check BASE_URL and model name in .env`;
    }
    if (status !== undefined) {
      return `❌ API unreachable — ${status} ${message} — check BASE_URL in .env`;
    }
    // Network-level error (ECONNREFUSED, timeout, etc.)
    return `❌ API unreachable — ${message} — check BASE_URL in .env`;
  }
}

// ── Slash command definition ──────────────────────────────────────────────────

export const command: SlashCommand = {
  name: '/ping',
  description: 'Check API endpoint reachability and measure round-trip latency',
  execute: async (ctx) => {
    const client = createClient(ctx.model);
    const result = await runPing(client, ctx.model);
    console.log(result);
    return { type: 'continue' };
  },
};
