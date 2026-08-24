// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Privacy Command
//  Toggle the ephemeral "no-disk-writes" session mode mid-session via an arrow-key
//  picker (mirrors /model and /role). The picker highlights the current mode.
//
//  Honesty note: a mid-session toggle is only partial protection —
//    • Turning ON does not un-write turns already saved to disk this session.
//    • Turning OFF writes the FULL in-memory history (including turns recorded while
//      privacy was ON) on the next save.
//  Both facts are surfaced as prominent warnings on every transition.
//   Usage: /privacy
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { setEphemeral, isEphemeral } from '../privacy.js';
import type { SlashCommand } from './types.js';

/**
 * Pure decision logic for a privacy-mode transition — no side effects.
 * Returns whether the mode actually changes and the lines to print.
 */
export function privacyTransition(from: boolean, to: boolean): { changed: boolean; lines: string[] } {
  if (from === to) {
    return {
      changed: false,
      lines: [chalk.dim(`  Privacy already ${to ? 'ON — nothing is being written to disk' : 'OFF — writing to disk normally'}.`)],
    };
  }

  if (to) {
    // OFF → ON
    return {
      changed: true,
      lines: [
        chalk.magenta.bold('  🔒 Privacy: ON — history, token graph, and session index will NOT be written from now on.'),
        chalk.yellow('  ⚠️  Turns already saved to disk earlier this session remain on disk — this does not erase them.'),
      ],
    };
  }

  // ON → OFF
  return {
    changed: true,
    lines: [
      chalk.green('  🔓 Privacy: OFF — disk writes resumed.'),
      chalk.yellow('  ⚠️  The full in-memory history — including turns recorded while privacy was ON — will be written on the next turn.'),
    ],
  };
}

export const command: SlashCommand = {
  name: '/privacy',
  description: 'Toggle ephemeral (no-disk-writes) mode mid-session',
  usage: '/privacy',
  execute: async () => {
    const current = isEphemeral();

    const choice = await select({
      message: `Privacy mode (current: ${current ? 'ON' : 'OFF'}):`,
      initialValue: current ? 'on' : 'off',
      options: [
        { value: 'off', label: 'Off — normal', hint: 'History, token graph & session index are saved to disk' },
        { value: 'on', label: 'On — ephemeral', hint: 'Nothing written to disk — for sensitive/throwaway work' },
      ],
    });

    if (isCancel(choice)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }

    const to = choice === 'on';
    const { changed, lines } = privacyTransition(current, to);
    if (changed) setEphemeral(to);
    for (const line of lines) console.log(line);
    console.log();
    return { type: 'continue' };
  },
};
