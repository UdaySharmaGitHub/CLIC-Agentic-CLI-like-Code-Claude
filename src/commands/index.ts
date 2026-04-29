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
import { SlashCommand, CommandContext, CommandAction } from './types.js';

// ── Registry array — add new commands here ───────────────────────────────────
const commands:SlashCommand[]=[
    exitCmd,
    clearCmd,
    historyCmd,
    statusCmd,
    helpCmd,
    rawCmd,
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
/** Check if Input is a registered slash command */
export function isSlashedCommand(input: string): boolean {
  return commandMap.has(input);
}

/** Execute a slash command by name */
export async function executeCommand(input: string, ctx: CommandContext): Promise<CommandAction> {
  const cmd = commandMap.get(input);
  if (!cmd) return { type: 'continue' };
  return cmd.execute(ctx);
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