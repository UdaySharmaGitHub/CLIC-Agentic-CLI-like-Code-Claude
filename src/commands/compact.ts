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
import type { ChatMessage } from '../memory.js';

export async function runCompact(
  callLLM: (msgs: ChatMessage[]) => Promise<string>,
  mode: 'manual' | 'auto' = 'manual',
): Promise<void> {
  const msgs = getMessages();
  if (msgs.length === 0) return;

  const before = msgs.length;

  const estimateTokens = (ms: ChatMessage[]) =>
    Math.ceil(ms.reduce((sum, m) =>
      sum + ('content' in m && typeof m.content === 'string' ? m.content.length : 0), 0) / 4);

  const tokensBefore = estimateTokens(msgs);

  const spinner = ora({ text: chalk.dim('  Compacting...'), color: 'cyan' }).start();

  try {
    const historyText = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const content = 'content' in m && typeof m.content === 'string' ? m.content : '[tool interaction]';
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const summary = await callLLM([{
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
    const tokensAfter = estimateTokens(getMessages());
    const freed = Math.max(0, tokensBefore - tokensAfter);
    const modeLabel = mode === 'auto' ? 'Auto' : 'Manual';
    console.log(chalk.green(`  ✅ Chat Compacted · ${modeLabel} · ${before} → 2 messages · ${chalk.bold(freed.toLocaleString())} tokens freed`));
  } catch (err) {
    spinner.stop();
    console.log(chalk.red(`  ❌ Auto-compact failed: ${err instanceof Error ? err.message : String(err)}`));
  }
  console.log();
}

export const command: SlashCommand = {
  name: '/compact',
  description: 'Summarize and compress conversation history to free up context',
  execute: async (ctx) => {
    if (getMessages().length === 0) {
      console.log(chalk.dim('  Nothing to compact.'));
      console.log();
      return { type: 'continue' };
    }
    if (!ctx.callLLM) {
      console.log(chalk.red('  ❌ /compact requires LLM access (not available in this context).'));
      console.log();
      return { type: 'continue' };
    }
    await runCompact(ctx.callLLM);
    return { type: 'continue' };
  },
};
