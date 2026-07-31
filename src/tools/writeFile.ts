// ─────────────────────────────────────────────────────────────────────────────
//  Tool: write_file
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { createPatch } from 'diff';
import { isPathSafe } from '../safety.js';
import {
  printToolHeader, printToolSuccess, printToolError,
  printToolBlocked, printRejected, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { resolvePath, renderDiff } from './helpers.js';

export const definition: ToolDefinition = {
  name: 'write_file',
  description: 'Create a new file or overwrite an existing file with the given content. Always provide the complete file content.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the file to create or overwrite' },
      content: { type: 'string', description: 'The full content to write to the file' },
    },
    required: ['filepath', 'content'],
  },
};

export async function execute(
  input: { filepath: string; content: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const filepath = resolvePath(input.filepath);
  printToolHeader('write_file', `Writing to ${filepath}`);

  const safety = isPathSafe(filepath);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — protected path: ${filepath}`, isError: true };
  }

  let exists = false;
  try { await fs.access(filepath); exists = true; } catch {}
  if (exists) {
    console.log(`  ${chalk.red('  ⚠️  WARNING: File already exists — will be OVERWRITTEN')}`);
  }

  let oldContent = '';
  if (exists) {
    oldContent = await fs.readFile(filepath, 'utf-8');
  }

  const patch = createPatch(filepath, oldContent, input.content + '\n');
  renderDiff(patch);

  if (!await confirm(`Approve write to '${filepath}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the file write.', isError: true };
  }

  try {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    const lines = input.content.split('\n');
    await fs.writeFile(filepath, input.content + '\n', 'utf-8');
    printToolSuccess(`File written: ${filepath} (${lines.length} lines)`);
    printSeparator();
    return { output: `File written successfully to '${filepath}' (${lines.length} lines).`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Write failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — failed to write file: ${msg}`, isError: true };
  }
}
