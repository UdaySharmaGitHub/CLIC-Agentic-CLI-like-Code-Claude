// ─────────────────────────────────────────────────────────────────────────────
//  Tool: append_file
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import chalk from 'chalk';
import { isPathSafe } from '../safety.js';
import {
  printToolHeader, printToolSuccess, printToolError,
  printToolBlocked, printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { resolvePath } from './helpers.js';
import {z} from 'zod';

export const schema = z.object({
  filepath: z.string().min(1, { message: 'Filepath is required' }),
  content: z.string().min(1, { message: 'Content is required' }),
}); 

export const definition: ToolDefinition = {
  name: 'append_file',
  description: 'Append text to the end of an existing file.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the file to append to' },
      content: { type: 'string', description: 'Text to append' },
    },
    required: ['filepath', 'content'],
  },
  schema,
};

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const filepath = resolvePath(input.filepath);
  printToolHeader('append_file', `Appending to ${filepath}`);

  const safety = isPathSafe(filepath);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — protected path: ${filepath}`, isError: true };
  }

  console.log(`  ${chalk.dim('  ── Content to Append ──────────────────────────────')}`);
  printDimOutput(input.content.split('\n').slice(0, 10).map(l => `│  ${l}`));
  console.log(`  ${chalk.dim('  ────────────────────────────────────────────────────')}`);
  console.log();

  if (!await confirm(`Approve append to '${filepath}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the append.', isError: true };
  }

  try {
    await fs.appendFile(filepath, input.content + '\n', 'utf-8');
    printToolSuccess(`Content appended to '${filepath}'.`);
    printSeparator();
    return { output: `Content appended successfully to '${filepath}'.`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Append failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
