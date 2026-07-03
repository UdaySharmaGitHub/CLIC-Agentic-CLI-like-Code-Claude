// ─────────────────────────────────────────────────────────────────────────────
//  Tool: run_command
// ─────────────────────────────────────────────────────────────────────────────

import { execa } from 'execa';
import chalk from 'chalk';
import { isCommandSafe } from '../safety.js';
import {
  printToolHeader, printToolSuccess, printToolError,
  printToolBlocked, printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

export const definition: ToolDefinition = {
  name: 'run_command',
  description: 'Execute a shell command and return its output. Use this for git, npm, build tools, and other CLI operations. Never use destructive commands like rm -rf /.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
    },
    required: ['command'],
  },
};

export async function execute(
  input: { command: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('run_command', input.command);
  console.log(`  ${chalk.yellow.bold('  Command:')} ${chalk.white(input.command)}`);
  console.log();

  const safety = isCommandSafe(input.command);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — command blocked by safety filter: ${safety.reason}`, isError: true };
  }

  if (!await confirm(`Approve execution?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the command.', isError: true };
  }

  console.log();
  console.log(`  ${chalk.green('  ⚙️  Executing...')}`);
  console.log(`  ${chalk.dim('  ────────────────────────────────────────────')}`);

  try {
    const result = await execa('bash', ['-c', input.command], {
      reject: false,
      timeout: 60_000,
      cwd: process.cwd(),
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const lines = output.split('\n');
    printDimOutput(lines, 50);

    console.log(`  ${chalk.dim('  ────────────────────────────────────────────')}`);
    if (result.exitCode === 0) {
      printToolSuccess(`Command completed successfully (exit 0)`);
    } else {
      console.log(`  ${chalk.red(`  ⚠️  Command exited with code: ${result.exitCode}`)}`);
    }
    printSeparator();

    // Surface error/warning lines first so they survive context truncation
    const MAX_CMD_OUTPUT = 12_000;
    const errorLines = lines.filter(l => /error|warn|fail|exception|traceback/i.test(l));
    const errorBlock = errorLines.length > 0
      ? `[Errors/Warnings]:\n${errorLines.join('\n')}\n\n[Full output]:\n`
      : '';
    const fullOutput = `[Command output (exit ${result.exitCode})]:\n${errorBlock}${output}`;

    return {
      output: fullOutput.length > MAX_CMD_OUTPUT
        ? fullOutput.slice(0, MAX_CMD_OUTPUT / 2) +
          `\n[...${fullOutput.length - MAX_CMD_OUTPUT} chars omitted...]\n` +
          fullOutput.slice(-MAX_CMD_OUTPUT / 2)
        : fullOutput,
      isError: result.exitCode !== 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Command execution failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
