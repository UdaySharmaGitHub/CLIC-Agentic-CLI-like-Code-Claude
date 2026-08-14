// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Session Command
//
//  Named sessions: create, switch, rename, list, and delete isolated sessions,
//  each with its own conversation history.
//
//  Usage:
//    /session                 Show the active session + quick stats
//    /session new [name]      Create and switch to a new session
//    /session switch <name>   Switch to an existing session
//    /session rename [name]   Rename the active session
//    /session list            List all sessions
//    /session delete <name>   Delete a session (not the active one)
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { text, confirm, select, isCancel } from '@clack/prompts';
import { getSessionTokenSummary } from '../knowledgeGraph.js';
import { sessionNameBadge } from '../ui.js';
import {
  listSessions,
  getActive,
  hasSession,
  createSession,
  renameSession,
  deleteSession,
  assertValidName,
  sessionNodeId,
} from '../session.js';
import type { CommandAction, SlashCommand } from './types.js';

function switchTo(name: string): CommandAction {
  // index.ts finalizes the swap (save current → load target) via the sessionId update.
  return { type: 'update', updates: { sessionId: sessionNodeId(name), sessionName: name } };
}

async function handleNew(name: string | undefined): Promise<CommandAction> {
  let sessionName = name;
  if (!sessionName) {
    const input = await text({
      message: 'New session name:',
      placeholder: 'e.g. debug-prod',
      validate: (v) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? undefined : 'Use letters, digits, - and _ only'),
    });
    if (isCancel(input)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    sessionName = input.trim();
  }

  try {
    assertValidName(sessionName);
    if (hasSession(sessionName)) {
      console.log(chalk.yellow(`  ⚠️  Session "${sessionName}" already exists. Use /session switch ${sessionName}.`));
      console.log();
      return { type: 'continue' };
    }
    await createSession(sessionName);
    console.log(chalk.green(`  ✅ Created and switched to session: ${chalk.white(sessionName)}`));
    console.log();
    return switchTo(sessionName);
  } catch (err) {
    console.log(chalk.red(`  ❌ ${err instanceof Error ? err.message : String(err)}`));
    console.log();
    return { type: 'continue' };
  }
}

async function handleSwitch(name: string | undefined, active: string): Promise<CommandAction> {
  let target = name;

  if (!target) {
    const others = listSessions().filter(s => s.name !== active);
    if (others.length === 0) {
      console.log(chalk.dim('  No other sessions to switch to. Create one with /session new.'));
      console.log();
      return { type: 'continue' };
    }
    const choice = await select({
      message: `Switch to session (current: ${active}):`,
      options: others.map(s => {
        const summary = getSessionTokenSummary(sessionNodeId(s.name));
        return {
          value: s.name,
          label: s.name,
          hint: `${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens`,
        };
      }),
    });
    if (isCancel(choice)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    target = choice as string;
  }

  if (target === active) {
    console.log(chalk.dim(`  Already on session "${target}".`));
    console.log();
    return { type: 'continue' };
  }
  if (!hasSession(target)) {
    console.log(chalk.red(`  ❌ No session named "${target}".`));
    console.log(chalk.dim(`  Create it with: /session new ${target}`));
    console.log();
    return { type: 'continue' };
  }
  console.log(chalk.green(`  ✅ Switched to session: ${chalk.white(target)}`));
  console.log();
  return switchTo(target);
}

async function handleRename(name: string | undefined, active: string): Promise<CommandAction> {
  let newName = name;
  if (!newName) {
    const input = await text({
      message: `Rename session "${active}" to:`,
      validate: (v) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? undefined : 'Use letters, digits, - and _ only'),
    });
    if (isCancel(input)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    newName = input.trim();
  }

  try {
    await renameSession(active, newName);
    console.log(chalk.green(`  ✅ Renamed session: ${chalk.dim(active)} → ${chalk.white(newName)}`));
    console.log();
    // Refresh the prompt/status indicator; the active file already holds this history.
    return { type: 'update', updates: { sessionId: sessionNodeId(newName), sessionName: newName } };
  } catch (err) {
    console.log(chalk.red(`  ❌ ${err instanceof Error ? err.message : String(err)}`));
    console.log();
    return { type: 'continue' };
  }
}

async function handleList(active: string): Promise<CommandAction> {
  const sessions = listSessions();
  const sep = chalk.dim(`  ${'─'.repeat(56)}`);
  console.log();
  console.log(chalk.cyan.bold('  🔖 Sessions'));
  console.log(sep);
  if (sessions.length === 0) {
    console.log(chalk.dim('  (no sessions yet)'));
  }
  for (const s of sessions) {
    const marker = s.name === active ? chalk.green('●') : chalk.dim('○');
    const summary = getSessionTokenSummary(sessionNodeId(s.name));
    const badge = sessionNameBadge(s.name);
    const stats = chalk.dim(`${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens`);
    const last = chalk.dim(`  last: ${s.lastActiveAt.slice(0, 19).replace('T', ' ')}`);
    console.log(`  ${marker} ${badge} ${stats}${last}`);
  }
  console.log(sep);
  console.log();
  return { type: 'continue' };
}

async function handleDelete(name: string | undefined, active: string): Promise<CommandAction> {
  let target = name;

  if (!target) {
    const deletable = listSessions().filter(s => s.name !== active);
    if (deletable.length === 0) {
      console.log(chalk.dim('  No other sessions to delete.'));
      console.log();
      return { type: 'continue' };
    }
    const choice = await select({
      message: 'Select session to delete:',
      options: deletable.map(s => {
        const summary = getSessionTokenSummary(sessionNodeId(s.name));
        return {
          value: s.name,
          label: s.name,
          hint: `${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens`,
        };
      }),
    });
    if (isCancel(choice)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    target = choice as string;
  }

  if (target === active) {
    console.log(chalk.red(`  ❌ Cannot delete the active session "${target}". Switch away first.`));
    console.log();
    return { type: 'continue' };
  }
  if (!hasSession(target)) {
    console.log(chalk.red(`  ❌ No session named "${target}".`));
    console.log();
    return { type: 'continue' };
  }

  const ok = await confirm({ message: `Delete session "${target}" and its history? This cannot be undone.` });
  if (isCancel(ok) || !ok) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return { type: 'continue' };
  }

  try {
    await deleteSession(target);
    console.log(chalk.green(`  🗑️  Deleted session: ${chalk.white(target)}`));
    console.log();
  } catch (err) {
    console.log(chalk.red(`  ❌ ${err instanceof Error ? err.message : String(err)}`));
    console.log();
  }
  return { type: 'continue' };
}

function handleStatus(active: string): CommandAction {
  const summary = getSessionTokenSummary(sessionNodeId(active));
  console.log();
  console.log(chalk.green(`  🔖 Active session: `) + sessionNameBadge(active));
  console.log(chalk.dim(`     ${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens · ${listSessions().length} session(s) total`));
  console.log(chalk.dim('     Subcommands: new · switch · rename · list · delete'));
  console.log();
  return { type: 'continue' };
}

export const command: SlashCommand = {
  name: '/session',
  aliases: ['/s'],
  description: 'Manage named sessions (new/switch/rename/list/delete)',
  usage: '/session [new|switch|rename|list|delete] [name]',
  execute: async (ctx, args) => {
    const active = ctx.sessionName ?? getActive();
    const [sub, ...rest] = (args ?? '').split(' ');
    const name = rest.join(' ').trim() || undefined;

    switch (sub) {
      case 'new':
        return handleNew(name);
      case 'switch':
        return handleSwitch(name, active);
      case 'rename':
        return handleRename(name, active);
      case 'list':
        return handleList(active);
      case 'delete':
      case 'rm':
        return handleDelete(name, active);
      case '':
      case undefined:
        return handleStatus(active);
      default:
        console.log(chalk.yellow(`  Unknown subcommand "${sub}". Try: new, switch, rename, list, delete.`));
        console.log();
        return { type: 'continue' };
    }
  },
};
