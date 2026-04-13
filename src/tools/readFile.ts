// ─────────────────────────────────────────────────────────────────────────────
//  Tool: read_file
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

export const definition: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file at the given path. Returns the file text. Use this to understand existing code before modifying it.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the file to read (absolute or relative to CWD)' },
    },
    required: ['filepath'],
  },
};

export async function execute(
  input: { filepath: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const filepath = resolvePath(input.filepath);
  printToolHeader('read_file', `Reading ${filepath}`);

  const safety = isPathSafe(filepath);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — protected file: ${filepath}`, isError: true };
  }

  if (!await confirm(`Approve reading '${filepath}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the file read.', isError: true };
  }

  try {
    const stat = await fs.stat(filepath);
    const content = await fs.readFile(filepath, 'utf-8');
    const lines = content.split('\n');
    const truncated = content.length > 12_000;
    const displayContent = truncated ? content.slice(0, 12_000) : content;

    console.log(`  ${chalk.dim(`  Lines: ${lines.length}  |  Size: ${stat.size} bytes`)}`);
    console.log();
    console.log(`  ${chalk.green('  ── File Contents ──────────────────────────────')}`);
    printDimOutput(displayContent.split('\n'), 80);
    if (lines.length > 80) {
      console.log(`  ${chalk.dim(`  ... (showing first 80 of ${lines.length} lines)`)}`);
    }
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess(`File read successfully (${lines.length} lines).`);
    printSeparator();

    const suffix = truncated ? '\n[... file truncated at 12000 chars ...]' : '';
    return {
      output: `[File '${filepath}' (${lines.length} lines)]:\n${displayContent}${suffix}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`File not found or unreadable: ${filepath}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
