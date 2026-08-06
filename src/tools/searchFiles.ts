// ─────────────────────────────────────────────────────────────────────────────
//  Tool: search_files
// ─────────────────────────────────────────────────────────────────────────────

import fg from 'fast-glob';
import chalk from 'chalk';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { resolvePath } from './helpers.js';

// Adding the zod schema for input validation
import { z } from 'zod';
const schema = z.object({
  pattern: z.string().min(1, { message: 'Pattern is required' }),
  directory: z.string().optional(),
});

export const definition: ToolDefinition = {
  name: 'search_files',
  description: 'Search for files matching a glob pattern. Returns a list of matching file paths. Useful for finding files in a project.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts", "**/*.json")' },
      directory: { type: 'string', description: 'Base directory to search from (default: current directory)' },
    },
    required: ['pattern'],
  },
  schema,
};

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const dir = resolvePath(input.directory || '.');
  printToolHeader('search_files', `Pattern: ${input.pattern} in ${dir}`);

  if (!await confirm(`Approve file search for '${input.pattern}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the file search.', isError: true };
  }

  try {
    const files = await fg(input.pattern, {
      cwd: dir,
      dot: false,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    if (files.length === 0) {
      console.log(`  ${chalk.dim('  No files found matching the pattern.')}`);
      printSeparator();
      return { output: `No files found matching '${input.pattern}' in '${dir}'.`, isError: false };
    }

    console.log(`  ${chalk.green(`  ── ${files.length} file(s) found ──────────────────────────`)}`);
    printDimOutput(files.slice(0, 100));
    if (files.length > 100) {
      console.log(`  ${chalk.dim(`  ... (${files.length} total, showing first 100)`)}`);
    }
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    printToolSuccess(`Found ${files.length} file(s).`);
    printSeparator();

    return {
      output: `[Search results for '${input.pattern}' in '${dir}'] (${files.length} files):\n${files.slice(0, 400).join('\n')}${files.length > 400 ? `\n[...${files.length - 400} more paths omitted — narrow your glob pattern]` : ''}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Search failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
