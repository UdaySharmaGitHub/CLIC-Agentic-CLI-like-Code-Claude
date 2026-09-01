// ─────────────────────────────────────────────────────────────────────────────
//  Tool: run_command  (persistent PTY — state survives across calls)
//
//  Commands run inside a named terminal in the TerminalManager pool.
//  Shell state (cwd, env, venv activations) persists between calls on the
//  same terminal, unlike the old ephemeral execa path.
//
//  Fallback: call disableTerminals() at startup (e.g. --no-terminals flag)
//  to revert to the legacy one-shot execa behaviour.
// ─────────────────────────────────────────────────────────────────────────────

import { execa } from 'execa';
import chalk from 'chalk';
import { z } from 'zod';
import { isCommandSafe } from '../safety.js';
import { terminalManager } from '../terminal.js';
import {
  printToolHeader, printToolSuccess, printToolError,
  printToolBlocked, printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Legacy fallback flag (set by --no-terminals at startup) ──────────────────

let _useTerminals = true;
export function disableTerminals(): void { _useTerminals = false; }
export function terminalsEnabled(): boolean { return _useTerminals; }

// ── Schema & definition ───────────────────────────────────────────────────────

export const schema = z.object({
  command:  z.string().min(1, { message: 'Command is required' }),
  terminal: z.string().min(1).max(32).optional(),
});

export const definition: ToolDefinition = {
  name: 'run_command',
  description:
    'Execute a shell command in a persistent terminal. Shell state (cwd, environment variables, ' +
    'activated virtualenvs) is preserved across calls on the same terminal. ' +
    'Defaults to the "main" terminal. Pass `terminal` to target a different named terminal. ' +
    'Use the `terminal` tool to create terminals, start background processes, or read output. ' +
    'Never use destructive commands like rm -rf /.',
  parameters: {
    type: 'object',
    properties: {
      command:  { type: 'string',  description: 'The shell command to execute' },
      terminal: { type: 'string',  description: 'Terminal name to run in (default: "main")' },
    },
    required: ['command'],
  },
  schema,
};

// ── Output helpers (shared by both paths) ─────────────────────────────────────

const MAX_CMD_OUTPUT = 12_000;

function formatOutput(output: string, exitCode: number | null): string {
  const lines = output.split('\n');
  const errorLines = lines.filter(l => /error|warn|fail|exception|traceback/i.test(l));
  const errorBlock = errorLines.length > 0
    ? `[Errors/Warnings]:\n${errorLines.join('\n')}\n\n[Full output]:\n`
    : '';
  const full = `[Command output (exit ${exitCode ?? 'timeout'})]:\n${errorBlock}${output}`;
  return full.length > MAX_CMD_OUTPUT
    ? full.slice(0, MAX_CMD_OUTPUT / 2) +
      `\n[...${full.length - MAX_CMD_OUTPUT} chars omitted...]\n` +
      full.slice(-MAX_CMD_OUTPUT / 2)
    : full;
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const termName = input.terminal ?? 'main';

  printToolHeader('run_command', input.command);
  console.log(`  ${chalk.yellow.bold('  Command:')} ${chalk.white(input.command)}`);
  if (_useTerminals) {
    console.log(`  ${chalk.dim('  Terminal:')} ${chalk.cyan(termName)}`);
  }
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

  // ── Persistent PTY path ───────────────────────────────────────────────────

  if (_useTerminals) {
    try {
      const result = await terminalManager.exec(termName, input.command);

      const lines = result.output.split('\n');
      printDimOutput(lines, 50);
      console.log(`  ${chalk.dim('  ────────────────────────────────────────────')}`);

      if (result.timedOut) {
        console.log(`  ${chalk.yellow(`  ⏱  Command timed out — still running in terminal "${termName}". Use the terminal tool to read output or kill it.`)}`);
        printSeparator();
        return {
          output: `[Command timed out — still running in terminal "${termName}"]\n${result.output}`,
          isError: true,
        };
      }

      if (result.exitCode === 0) {
        printToolSuccess(`Command completed successfully (exit 0) in terminal "${termName}"`);
      } else {
        console.log(`  ${chalk.red(`  ⚠️  Command exited with code: ${result.exitCode} (terminal "${termName}")`)}`);
      }
      printSeparator();

      return {
        output:  formatOutput(result.output, result.exitCode),
        isError: result.exitCode !== 0,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      printToolError(`Command execution failed: ${msg}`);
      printSeparator();
      return { output: `ERROR — ${msg}`, isError: true };
    }
  }

  // ── Legacy ephemeral path (--no-terminals) ────────────────────────────────

  try {
    const result = await execa('bash', ['-c', input.command], {
      reject:  false,
      timeout: 60_000,
      cwd:     process.cwd(),
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const lines  = output.split('\n');
    printDimOutput(lines, 50);

    console.log(`  ${chalk.dim('  ────────────────────────────────────────────')}`);
    if (result.exitCode === 0) {
      printToolSuccess(`Command completed successfully (exit 0)`);
    } else {
      console.log(`  ${chalk.red(`  ⚠️  Command exited with code: ${result.exitCode}`)}`);
    }
    printSeparator();

    return {
      output:  formatOutput(output, result.exitCode ?? null),
      isError: result.exitCode !== 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Command execution failed: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
