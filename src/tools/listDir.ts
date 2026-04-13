// ─────────────────────────────────────────────────────────────────────────────
//  Tool: list_directory
// ─────────────────────────────────────────────────────────────────────────────

import { execa } from 'execa';
import chalk from 'chalk';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { resolvePath } from './helpers.js';

export const definition: ToolDefinition = {
  name: 'list_directory',
  description: 'List the contents of a directory with file details (permissions, size, modification time).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list (default: current directory)' },
    },
    required: [],
  },
};

export async function execute(
  input: { path?: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const dirPath = resolvePath(input.path || '.');
  printToolHeader('list_directory', `Listing ${dirPath}`);

  if (!await confirm(`Approve listing '${dirPath}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the directory listing.', isError: true };
  }

  try {
    const result = await execa('ls', ['-la', dirPath], { reject: false, timeout: 10_000 });
    const output = result.stdout || result.stderr;
    const lines = output.split('\n');

    console.log(`  ${chalk.green('  ── Directory Listing ──────────────────────────────')}`);
    printDimOutput(lines, 60);
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess('Listed successfully.');
    printSeparator();
    return { output: `[Directory listing of '${dirPath}']:\n${output}`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Directory not found: ${dirPath}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
