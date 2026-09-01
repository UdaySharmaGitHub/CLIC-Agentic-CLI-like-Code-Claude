// ─────────────────────────────────────────────────────────────────────────────
//  Tool: terminal — multiplexed PTY terminal pool manager
//
//  Actions:
//    create  — spawn a new named terminal (optional cwd)
//    list    — list all terminals with status/cwd/pid (no confirm)
//    read    — return last N lines of buffered output (no confirm)
//    write   — send raw stdin to a running/background process
//    start   — start a background (non-blocking) process
//    kill    — destroy a terminal and remove it from the pool
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { z } from 'zod';
import { terminalManager } from '../terminal.js';
import { isCommandSafe } from '../safety.js';
import {
  printToolHeader, printToolSuccess, printToolError,
  printToolBlocked, printRejected, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Schema (discriminated union on action) ────────────────────────────────────

const nameOpt    = z.string().min(1).max(32).optional();
const nameReq    = z.string().min(1).max(32);
const cmdReq     = z.string().min(1);

export const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: nameOpt,  cwd: z.string().optional() }),
  z.object({ action: z.literal('list')  }),
  z.object({ action: z.literal('read'),  name: nameOpt,   lines: z.number().int().positive().max(500).optional() }),
  z.object({ action: z.literal('write'), name: nameReq,   input: cmdReq }),
  z.object({ action: z.literal('start'), name: nameOpt,   command: cmdReq }),
  z.object({ action: z.literal('kill'),  name: nameReq }),
]);

// ── Definition ────────────────────────────────────────────────────────────────

export const definition: ToolDefinition = {
  name: 'terminal',
  description:
    'Manage a pool of persistent PTY terminals. Each terminal retains its shell state. ' +
    'Actions: ' +
    '"create" — spawn a new named terminal (name optional, cwd optional); ' +
    '"list" — list all terminals with status, cwd, pid (no confirmation needed); ' +
    '"read" — return last N lines of buffered output from a terminal (no confirmation needed, default name="main", lines=50); ' +
    '"write" — send raw stdin to a running/background process (e.g. to answer an interactive prompt); ' +
    '"start" — start a long-running background command (dev server, watcher) — returns immediately, use read to poll output; ' +
    '"kill" — destroy a terminal and free its slot.',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string',  description: 'One of: create | list | read | write | start | kill' },
      name:    { type: 'string',  description: 'Terminal name (1–32 chars). Required for write/kill. Defaults to "main" for read/start. Optional for create.' },
      command: { type: 'string',  description: 'Shell command to run (required for start)' },
      input:   { type: 'string',  description: 'Raw stdin to send to the terminal (required for write)' },
      cwd:     { type: 'string',  description: 'Working directory for the new terminal (create only)' },
      lines:   { type: 'number',  description: 'Number of output lines to return (read only, default 50)' },
    },
    required: ['action'],
  },
  schema,
};

// ── Auto-name counter ─────────────────────────────────────────────────────────

let _autoIdx = 0;
function autoName(): string {
  _autoIdx++;
  return `term-${_autoIdx}`;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreate(
  input: { action: 'create'; name?: string; cwd?: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const name = input.name ?? autoName();
  printToolHeader('terminal:create', name);
  if (input.cwd) console.log(`  ${chalk.dim('  cwd:')} ${chalk.white(input.cwd)}`);
  console.log();

  if (!await confirm(`Spawn terminal "${name}"?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected terminal creation.', isError: true };
  }

  try {
    await terminalManager.spawn(name, input.cwd);
    const info = terminalManager.get(name)!;
    printToolSuccess(`Terminal "${name}" ready (pid=${info.pid})`);
    printSeparator();
    return {
      output: `Terminal "${name}" spawned and ready (pid=${info.pid}, cwd=${info.cwd}).`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

function handleList(): ToolResult {
  printToolHeader('terminal:list', '');
  console.log();
  const list = terminalManager.list();
  if (list.length === 0) {
    console.log(chalk.dim('  No terminals active.'));
    printSeparator();
    return { output: 'No terminals active.', isError: false };
  }
  for (const t of list) {
    const badge = t.status === 'idle'       ? chalk.green('idle')
                : t.status === 'running'    ? chalk.yellow('running')
                : t.status === 'background' ? chalk.cyan('background')
                :                             chalk.red('killed');
    console.log(
      `  ${chalk.bold(t.name.padEnd(16))}` +
      `${badge.padEnd(20)} ` +
      `pid=${chalk.dim(String(t.pid ?? '?'))}  ` +
      `cwd=${chalk.dim(t.cwd)}` +
      (t.lastCommand ? `  last=${chalk.dim(t.lastCommand.slice(0, 40))}` : ''),
    );
  }
  printSeparator();
  return {
    output: list.map(t =>
      `${t.name}: status=${t.status}, pid=${t.pid ?? '?'}, cwd=${t.cwd}` +
      (t.lastCommand ? `, last="${t.lastCommand}"` : ''),
    ).join('\n'),
    isError: false,
  };
}

function handleRead(input: { action: 'read'; name?: string; lines?: number }): ToolResult {
  const name  = input.name  ?? 'main';
  const lines = input.lines ?? 50;
  printToolHeader('terminal:read', `${name} (last ${lines} lines)`);
  console.log();

  try {
    const buf = terminalManager.read(name, lines);
    const display = buf || chalk.dim('(buffer empty)');
    console.log(chalk.dim('  ────────────────────────────────────────────'));
    const visLines = (buf || '').split('\n').slice(-20);
    for (const l of visLines) console.log(`  ${chalk.dim(l)}`);
    console.log(chalk.dim('  ────────────────────────────────────────────'));
    printSeparator();
    return { output: buf || '(buffer empty)', isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

async function handleWrite(
  input: { action: 'write'; name: string; input: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('terminal:write', input.name);
  console.log(`  ${chalk.dim('  input:')} ${chalk.white(JSON.stringify(input.input))}`);
  console.log();

  if (!await confirm(`Send input to terminal "${input.name}"?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected write.', isError: true };
  }

  try {
    terminalManager.write(input.name, input.input);
    printToolSuccess(`Input sent to "${input.name}"`);
    printSeparator();
    return { output: `Sent ${input.input.length} chars to terminal "${input.name}".`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

async function handleStart(
  input: { action: 'start'; name?: string; command: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const name = input.name ?? 'main';
  printToolHeader('terminal:start', `${name} — ${input.command}`);
  console.log();

  const safety = isCommandSafe(input.command);
  if (!safety.safe) {
    printToolBlocked(safety.reason!);
    printSeparator();
    return { output: `ERROR — command blocked: ${safety.reason}`, isError: true };
  }

  if (!await confirm(`Start background process in terminal "${name}"?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected background start.', isError: true };
  }

  try {
    await terminalManager.startBackground(name, input.command);
    console.log(chalk.cyan(`  ⚡ Background process started in "${name}". Use terminal(read) to poll output.`));
    printSeparator();
    return {
      output: `Background process started in terminal "${name}": ${input.command}. Use terminal(action=read, name="${name}") to check output.`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

async function handleKill(
  input: { action: 'kill'; name: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('terminal:kill', input.name);
  console.log();

  if (!await confirm(`Kill terminal "${input.name}"?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected kill.', isError: true };
  }

  try {
    await terminalManager.kill(input.name);
    printToolSuccess(`Terminal "${input.name}" killed.`);
    printSeparator();
    return { output: `Terminal "${input.name}" killed and removed from pool.`, isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  switch (input.action) {
    case 'create': return handleCreate(input, confirm);
    case 'list':   return handleList();
    case 'read':   return handleRead(input);
    case 'write':  return handleWrite(input, confirm);
    case 'start':  return handleStart(input, confirm);
    case 'kill':   return handleKill(input, confirm);
  }
}
