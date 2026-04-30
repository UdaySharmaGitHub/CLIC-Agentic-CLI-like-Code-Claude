// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Retry Command
//  This command allows the user to regenerate the last response by re-running the last user message.
//   Usage: /retry or /r
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { getMessages } from '../memory.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/retry',
  aliases: ['/r'],
  description: 'Regenerate the last response (re-run last user message)',
  execute: async () => {
    const lastUser = [...getMessages()].reverse().find(m => m.role === 'user');
    if (!lastUser) {
      console.log(chalk.dim('  No previous message to retry.'));
      console.log();
      return { type: 'continue' };
    }

    const preview = 'content' in lastUser && typeof lastUser.content === 'string'
      ? lastUser.content.slice(0, 80)
      : '[message]';
    console.log(chalk.cyan(`  🔄 Retrying: "${preview}${preview.length >= 80 ? '…' : ''}"`));
    console.log();
    return { type: 'retry' };
  },
};
