// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Tokens Command
//  This command estimates the current token usage of the conversation, including system prompt and messages, to help users manage context limits.
//   Usage: /tokens
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { getMessages } from '../memory.js';
import type { SlashCommand } from './types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const command: SlashCommand = {
  name: '/tokens',
  description: 'Show estimated token usage for the current conversation',
  execute: async (ctx) => {
    const msgs = getMessages();

    let conversationTokens = 0;
    for (const msg of msgs) {
      const content = 'content' in msg && typeof msg.content === 'string' ? msg.content : '';
      conversationTokens += estimateTokens(content);
    }

    const sysTokens = ctx.systemPrompt ? estimateTokens(ctx.systemPrompt) : 0;
    const total = conversationTokens + sysTokens;

    console.log();
    console.log(chalk.cyan.bold('  📊 Token Usage Estimate'));
    console.log(chalk.dim(`  ${'─'.repeat(40)}`));
    if (sysTokens > 0) {
      console.log(`  ${chalk.dim('System prompt')}   ~${sysTokens.toLocaleString()} tokens`);
    }
    console.log(`  ${chalk.dim('Conversation')}    ~${conversationTokens.toLocaleString()} tokens  (${msgs.length} messages)`);
    console.log(`  ${chalk.dim('Total')}           ~${chalk.white(total.toLocaleString())} tokens`);
    console.log(chalk.dim(`  ${'─'.repeat(40)}`));
    console.log(chalk.dim('  Estimate: ~4 chars/token. Actual varies by model.'));
    console.log();
    return { type: 'continue' };
  },
};
