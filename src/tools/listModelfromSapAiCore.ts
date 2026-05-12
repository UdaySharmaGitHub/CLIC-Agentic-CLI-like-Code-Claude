// ─────────────────────────────────────────────────────────────────────────────
//  Tool: list_models — lists available models from the configured API endpoint
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import OpenAI from 'openai';
import {
  printToolHeader, printToolSuccess, printToolError,
  printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Tool definition ───────────────────────────────────────────────────────────

export const definition: ToolDefinition = {
  name: 'list_models',
  description:
    'List all available models from the configured OpenAI-compatible API endpoint. ' +
    'Returns model IDs and ownership info.',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Keyword to filter results by model ID, e.g. "gpt", "claude", "embed". Leave empty for all.',
      },
    },
    required: [],
  },
};

// ── Startup helper — fetch models for interactive selection ──────────────────

export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

function createOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.API_KEY ?? '',
    baseURL: process.env.BASE_URL?.trim() ?? 'https://api.openai.com/v1',
  });
}

/**
 * Fetches all available models and returns them as picker-ready options.
 * Embedding models are excluded — they cannot be used for chat completions.
 * Called during the CLIC startup wizard before the REPL starts.
 */
export async function fetchAvailableModelOptions(): Promise<ModelOption[]> {
  const client = createOpenAIClient();
  const response = await client.models.list();
  const models = response.data ?? [];

  const options: ModelOption[] = [];
  for (const m of models) {
    if (/embed/i.test(m.id)) continue; // skip embedding models
    options.push({
      value: m.id,
      label: m.id,
      hint: `owned by: ${m.owned_by}`,
    });
  }

  return options.sort((a, b) => a.value.localeCompare(b.value));
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(
  input: { filter?: string },
  _confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('list_models', 'Fetching from API endpoint');

  try {
    const client = createOpenAIClient();
    const response = await client.models.list();
    const all = response.data ?? [];

    const models = input.filter
      ? all.filter(m => m.id.toLowerCase().includes(input.filter!.toLowerCase()))
      : all;

    const sep = '='.repeat(60);
    const lines: string[] = [
      sep,
      'AVAILABLE MODELS',
      sep,
      `Total: ${all.length}` + (input.filter ? `  (showing ${models.length} matching "${input.filter}")` : ''),
      '',
    ];

    for (const [i, m] of models.entries()) {
      lines.push(`${i + 1}. ${m.id}  (owned_by: ${m.owned_by})`);
    }
    lines.push(sep);

    printDimOutput(lines, 60);
    console.log();
    printToolSuccess(`${models.length} model(s) listed.`);
    printSeparator();

    return { output: lines.join('\n'), isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Failed to list models: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
