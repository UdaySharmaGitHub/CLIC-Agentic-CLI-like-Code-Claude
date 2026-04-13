// ─────────────────────────────────────────────────────────────────────────────
//  Tool: modify_file
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
  name: 'modify_file',
  description: 'Find and replace text in a file. The find text must be an EXACT match of existing content. Read the file first if you are unsure of the exact text.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the file to modify' },
      find: { type: 'string', description: 'The exact text to find (must match exactly)' },
      replace: { type: 'string', description: 'The replacement text' },
    },
    required: ['filepath', 'find', 'replace'],
  },
};

export async function execute(
  input: { filepath: string; find: string; replace: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const filepath = resolvePath(input.filepath);
  printToolHeader('modify_file', `Modifying ${filepath}`);

  const safety = isPathSafe(filepath);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — protected file: ${filepath}`, isError: true };
  }

  let content: string;
  try {
    content = await fs.readFile(filepath, 'utf-8');
  } catch {
    printToolError(`File not found: ${filepath}`);
    printSeparator();
    return { output: `ERROR — file not found: ${filepath}`, isError: true };
  }

  if (!content.includes(input.find)) {
    printToolError('Text not found in file. Cannot patch.');
    printSeparator();
    return {
      output: `ERROR — find text not found in '${filepath}'. Read the file first to get the exact text.`,
      isError: true,
    };
  }

  // Show diff preview
  console.log(`  ${chalk.red('  − Find:')}`);
  printDimOutput(input.find.split('\n').slice(0, 5));
  console.log();
  console.log(`  ${chalk.green('  + Replace:')}`);
  printDimOutput(input.replace.split('\n').slice(0, 5));
  console.log();

  if (!await confirm(`Approve this change to '${filepath}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the modification.', isError: true };
  }

  try {
    // Backup
    await fs.writeFile(`${filepath}.bak`, content, 'utf-8');
    console.log(`  ${chalk.dim(`  Backup saved: ${filepath}.bak`)}`);

    // Safe single-occurrence replacement (no regex special chars)
    const idx = content.indexOf(input.find);
    const newContent = content.substring(0, idx) + input.replace + content.substring(idx + input.find.length);
    await fs.writeFile(filepath, newContent, 'utf-8');

    printToolSuccess(`File modified: ${filepath}`);
    printSeparator();
    return { output: `File '${filepath}' modified successfully. Backup saved at '${filepath}.bak'.`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Modification failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — modification failed: ${msg}`, isError: true };
  }
}
