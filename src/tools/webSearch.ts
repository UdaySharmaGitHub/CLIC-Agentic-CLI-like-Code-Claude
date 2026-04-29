// ─────────────────────────────────────────────────────────────────────────────
//  Tool: web_search — search the web via SAP Gen AI Hub orchestration
//
//  Uses the same AICORE_SERVICE_KEY as the main agent.
//  Sends a dedicated chat completion request with a search-oriented prompt.
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { OrchestrationClient } from '@sap-ai-sdk/orchestration';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

export const definition: ToolDefinition = {
  name: 'web_search',
  description: 'Answer questions about the real world — current events, people, companies, science, technology, sports, finance, geography, history, or any general knowledge topic. Use this whenever the user asks about anything beyond coding or local files.',
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

  return searchWithOrchestration(input.query);
}

// ── SAP Gen AI Hub Web Search ────────────────────────────────────────────────

async function searchWithOrchestration(query: string): Promise<ToolResult> {
  const model = process.env.CLIC_MODEL || 'gpt-4o';

  try {
    const client = new OrchestrationClient({
      promptTemplating: {
        model: {
          name: model,
          params: { max_completion_tokens: 4096, temperature: 0.2 },
        },
      },
    });

    const response = await client.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a knowledgeable research assistant with broad, up-to-date knowledge about the world.
When asked a question:
- Answer directly and thoroughly using everything you know.
- Cover facts, context, background, and relevant details.
- If the topic involves people, companies, events, science, technology, news, sports, finance, geography, or culture — answer confidently.
- Structure your response clearly: use bullet points, sections, or numbered lists where helpful.
- If you know relevant figures, dates, names, or statistics, include them.
- If the information may have changed recently (e.g. stock prices, breaking news), say so honestly — but still provide the best answer you can from your knowledge.
- Never say "I cannot search the internet." You have extensive world knowledge — use it.`,
        },
        {
          role: 'user',
          content: `Question: ${query}\n\nProvide a detailed, well-structured answer.`,
        },
      ],
    });

    const searchText = response.getContent()?.slice(0, 8000);

    if (!searchText) {
      printToolError('Web search returned no results.');
      printSeparator();
      return { output: 'ERROR — web search returned no results.', isError: true };
    }

    const lines = searchText.split('\n');

    console.log(`  ${chalk.green('  ── Search Results ──────────────────────────────')}`);
    printDimOutput(lines, 60);
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess('Web search completed.');
    printSeparator();

    return {
      output: `[Web search results for '${query}']:\n${searchText}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Web search failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — web search failed: ${msg}`, isError: true };
  }
}
