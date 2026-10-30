// ─────────────────────────────────────────────────────────────────────────────
//  Tool: web_search — real-time internet search via gpt-5
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import OpenAI from 'openai';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui/index.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { withRetry } from '../retry.js';
import { z } from 'zod';

const schema = z.object({
  query: z.string().min(1, { message: 'Query is required' }),
});

export const definition: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the internet for real-time information — current events, breaking news, ' +
    'stock prices, weather, recent research, or any topic requiring up-to-date data. ' +
    'Use this when the answer may have changed since the model\'s training cutoff.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
  schema,
};

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const currentYear = new Date().getFullYear();
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Replace any stale year in the query with the current year before anything else runs.
  const freshQuery = input.query.replace(/\b(20\d{2})\b/g, (match) =>
    Number(match) < currentYear ? String(currentYear) : match,
  );

  await printToolHeader('web_search', `Query: ${freshQuery}`);

  if (!await confirm(`Approve web search for '${freshQuery}'?`)) {
    await printRejected();
    await printSeparator();
    return { output: 'User rejected the web search.', isError: true };
  }

  console.log(`  ${chalk.green('  🌐 Searching the web...')}`);
  console.log();

  // Always uses SEARCH_MODEL (defaults to gpt-5) with the same BASE_URL
  // and API_KEY as the main client — independent of the active chat model.
  const searchModel = process.env.SEARCH_MODEL ?? 'gpt-5';

  const client = new OpenAI({
    apiKey: process.env.API_KEY ?? '',
    baseURL: process.env.BASE_URL ?? 'https://api.openai.com/v1',
  });

  try {
    const result = await withRetry(() =>
      client.chat.completions.create({
        model: searchModel,
        messages: [
          { role: 'system', content: `Today is ${today}. Always search for and return the most recent information available.` },
          { role: 'user', content: freshQuery },
        ],
        stream: false,
      }),
    ) as OpenAI.ChatCompletion & { citations?: string[] };

    const text = result.choices[0]?.message?.content ?? '';
    const citations: string[] = result.citations ?? [];

    if (!text) {
      await printToolError('Web search returned no results.');
      await printSeparator();
      return { output: 'ERROR — web search returned no results.', isError: true };
    }

    const lines = text.split('\n');
    console.log(`  ${chalk.green('  ── Search Results ──────────────────────────────')}`);
    await printDimOutput(lines, 60);

    if (citations.length > 0) {
      console.log(`  ${chalk.green('  ── Sources ─────────────────────────────────────')}`);
      for (const url of citations) {
        console.log(`  ${chalk.dim(`  • ${url}`)}`);
      }
    }

    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    await printToolSuccess('Web search completed.');
    await printSeparator();

    const citationsBlock = citations.length > 0
      ? `\n\nSources:\n${citations.map(url => `- ${url}`).join('\n')}`
      : '';

    return {
      output: `[Web search results for '${freshQuery}']:\n${text}${citationsBlock}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth =
      msg.includes('401') ||
      msg.toLowerCase().includes('unauthorized') ||
      msg.toLowerCase().includes('api key');
    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');

    const userMsg = isAuth
      ? 'Web search failed: invalid API key. Check API_KEY in your .env file.'
      : isRateLimit
        ? 'Web search rate-limited. Retry in a moment.'
        : `Web search failed: ${msg}`;

    await printToolError(userMsg);
    await printSeparator();
    return { output: `ERROR — ${userMsg}`, isError: true };
  }
}
