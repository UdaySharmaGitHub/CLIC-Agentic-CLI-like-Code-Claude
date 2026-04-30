// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Compact Command
//  This command summarizes and compresses the conversation history into a concise context block, freeing up tokens while preserving key information.
//   Usage: /compact
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import ora from 'ora';
import { getMessages, clearMessages, pushMessage } from '../memory.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/compact',
  description: 'Summarize and compress conversation history to free up context',
  execute: async (ctx) => {
    const msgs = getMessages();
    if (msgs.length === 0) {
      console.log(chalk.dim('  Nothing to compact.'));
      console.log();
      return { type: 'continue' };
    }

    if (!ctx.callLLM) {
      console.log(chalk.red('  ❌ /compact requires LLM access (not available in this context).'));
      console.log();
      return { type: 'continue' };
    }

    const before = msgs.length;
    const spinner = ora({ text: chalk.dim('  Compacting conversation...'), color: 'cyan' }).start();

    try {
      const historyText = msgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          const role = m.role === 'user' ? 'User' : 'Assistant';
          const content = 'content' in m && typeof m.content === 'string' ? m.content : '[tool interaction]';
          return `${role}: ${content}`;
        })
        .join('\n\n');

      const summary = await ctx.callLLM([{
        role: 'user',
        content: `Summarize the following conversation into a concise context block (max 400 words). Preserve: key decisions, code written, file paths mentioned, current task state, and any important facts established.\n\n${historyText}`,
      }]);

      clearMessages();
      pushMessage({
        role: 'user',
        content: `[Conversation compacted — summary of prior context]\n\n${summary}`,
      });
      pushMessage({
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation. How can I continue helping you?',
      });

      spinner.stop();
      console.log(chalk.green(`  ✅ Compacted ${before} → 2 messages`));
    } catch (err) {
      spinner.stop();
      console.log(chalk.red(`  ❌ Compact failed: ${err instanceof Error ? err.message : String(err)}`));
    }

    console.log();
    return { type: 'continue' };
  },
};
