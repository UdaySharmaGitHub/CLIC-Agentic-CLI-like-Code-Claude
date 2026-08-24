// ─────────────────────────────────────────────────────────────────────────────
//  Command Registry — central router for all slash commands
//
//  To add a new command:
//    1. Create src/commands/myCommand.ts exporting `command: SlashCommand`
//    2. Import it here and add to the `commands` array
//    That's it — the registry wires routing + completer automatically.
// ─────────────────────────────────────────────────────────────────────────────

// ── Import all commands ──────────────────────────────────────────────────────
import { command as exitCmd } from './exit.js';
import { command as clearCmd } from './clear.js';
import { command as historyCmd } from './history.js';
import { command as statusCmd } from './status.js';
import { command as helpCmd } from './help.js';
import { command as rawCmd } from './raw.js';
import { command as compactCmd } from './compact.js';
import { command as modelCmd } from './model.js';
import { command as undoCmd } from './undo.js';
import { command as retryCmd } from './retry.js';
import { command as tokensCmd } from './tokens.js';
import { command as roleCmd } from './role.js';
import { command as sessionCmd } from './session.js';
import { command as privacyCmd } from './privacy.js';
import { SlashCommand, CommandContext, CommandAction } from './types.js';

// ── Registry array — add new commands here ───────────────────────────────────
const commands: SlashCommand[] = [
  exitCmd,
  clearCmd,
  historyCmd,
  statusCmd,
  helpCmd,
  rawCmd,
  compactCmd,
  modelCmd,
  undoCmd,
  retryCmd,
  tokensCmd,
  roleCmd,
  sessionCmd,
  privacyCmd,
];

// ── Build name → command lookup (including aliases) ──────────────────────────
const commandMap = new Map<string, SlashCommand>();
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commandMap.set(alias, cmd);
    }
  }
}

// --- Public API --------------------------------------------------------------------

/** Check if input starts with a registered slash command name */
export function isSlashedCommand(input: string): boolean {
  const name = input.split(' ')[0];
  return commandMap.has(name);
}

/** Execute a slash command, parsing name and trailing args */
export async function executeCommand(input: string, ctx: CommandContext): Promise<CommandAction> {
  const [name, ...rest] = input.split(' ');
  const args = rest.join(' ').trim() || undefined;
  const cmd = commandMap.get(name);
  if (!cmd) return { type: 'continue' };
  return cmd.execute(ctx, args);
}

/** Get all commands (for suggestion menu / help) */
export function getSlashCommands(): SlashCommand[] {
  return commands;
}

/** Readline-compatible tab completer */
export function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  const allNames = commands.flatMap(c => [c.name, ...(c.aliases ?? [])]);
  const hits = allNames.filter(n => n.startsWith(line));
  return [hits.length ? hits : allNames, line];
}

// ── Re-export types ──────────────────────────────────────────────────────────
export type { SlashCommand, CommandContext, CommandAction } from './types.js';
