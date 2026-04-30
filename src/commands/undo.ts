import chalk from 'chalk';
import { getMessages, clearMessages, pushMessage } from '../memory.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/undo',
  description: 'Remove the last user + assistant exchange from history',
  execute: async () => {
    const original = getMessages();
    if (original.length === 0) {
      console.log(chalk.dim('  Nothing to undo.'));
      console.log();
      return { type: 'continue' };
    }

    const newMsgs = [...original];

    // Pop all trailing non-user messages (assistant + tool turns)
    while (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role !== 'user') {
      newMsgs.pop();
    }
    // Pop the user message that triggered it
    if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'user') {
      newMsgs.pop();
    }

    const removed = original.length - newMsgs.length;
    clearMessages();
    for (const m of newMsgs) pushMessage(m);

    console.log(chalk.green(`  ✅ Undone — removed ${removed} message(s). History: ${newMsgs.length} messages.`));
    console.log();
    return { type: 'continue' };
  },
};
