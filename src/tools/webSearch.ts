// ─────────────────────────────────────────────────────────────────────────────
//  Tool: web_search — search the web via Gemini Google Search grounding
//
//  Uses the same Gemini API key as the main agent — no extra API key needed.
//  Sends {tools: [{google_search: {}}]} so Gemini grounds its answer
//  with live web results. Returns search-grounded text + source URLs.
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

export const definition: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for real-time / up-to-date information. Use this when the user asks about current events, latest versions, live data, or anything your training data may not cover.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
};

export async function execute(
  input: { query: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('web_search', `Query: ${input.query}`);

  if (!input.query) {
    printToolError('No search query provided.');
    printSeparator();
    return { output: 'ERROR — no search query provided.', isError: true };
  }

  if (!await confirm(`Approve web search for '${input.query}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the web search.', isError: true };
  }

  console.log(`  ${chalk.green('  🌐 Searching the web...')}`);
  console.log();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    printToolError('GEMINI_API_KEY not set.');
    printSeparator();
    return { output: 'ERROR — GEMINI_API_KEY not configured.', isError: true };
  }

  return searchWithGemini(input.query, apiKey);
}

// ── Gemini Google Search Grounding ───────────────────────────────────────────

async function searchWithGemini(query: string, apiKey: string): Promise<ToolResult> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `Search the web and provide a detailed, factual answer with sources: ${query}` }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      printToolError(`Gemini Search failed (${resp.status}): ${errText.slice(0, 200)}`);
      printSeparator();
      return { output: `ERROR — Gemini Search failed: ${resp.status}`, isError: true };
    }

    const data = await resp.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
      error?: { message?: string };
    };

    // Extract the grounded answer text
    const searchText = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join('\n')
      .slice(0, 8000);

    if (!searchText) {
      const errMsg = data.error?.message ?? 'Search failed — unknown error';
      printToolError(`Web search failed: ${errMsg}`);
      printSeparator();
      return { output: `ERROR — web search failed: ${errMsg}`, isError: true };
    }

    // Extract grounding source URLs
    const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = [...new Set(
      groundingChunks
        .map((c) => c.web?.uri)
        .filter((u): u is string => !!u),
    )].slice(0, 8);

    const lines = searchText.split('\n');

    console.log(`  ${chalk.green('  ── Search Results ──────────────────────────────')}`);
    printDimOutput(lines, 60);

    if (sources.length > 0) {
      console.log();
      console.log(`  ${chalk.blue('  📎 Sources:')}`);
      for (const src of sources) {
        console.log(`  ${chalk.dim(`    • ${src}`)}`);
      }
    }
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess('Web search completed.');
    printSeparator();

    const sourceText = sources.length > 0 ? `\n\nSources:\n${sources.join('\n')}` : '';
    return {
      output: `[Web search results for '${query}']:\n${searchText}${sourceText}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Gemini Search error: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
