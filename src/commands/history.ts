import chalk from 'chalk';
import { getMessages } from '../memory.js';
import { printSeparator } from '../ui.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/history',
  description: 'Show conversation history',
  execute: async () => {
    const msgs = getMessages();
    if (msgs.length === 0) {
      console.log(chalk.dim('  No history yet.'));
    } else {
      console.log();
      console.log(chalk.cyan.bold(`  📜 Chat History (${msgs.length} messages):`));
      printSeparator();
      for (const msg of msgs) {
        const role = msg.role === 'user' ? '🧑 You' : msg.role === 'assistant' ? '🤖 AI' : `🔧 ${msg.role}`;
        let contentStr = '';
        if ('content' in msg && typeof msg.content === 'string') {
          contentStr = msg.content;
        } else if (msg.role === 'assistant' && 'tool_calls' in msg && (msg as any).tool_calls) {
          contentStr = `[tool call: ${(msg as any).tool_calls.map((tc: any) => tc.function.name).join(', ')}]`;
        }
        const preview = contentStr.split('\n')[0]?.slice(0, 100) || '[tool call/response]';
        console.log(`  ${role}: ${preview}`);
      }
      printSeparator();
    }
    console.log();
    return { type: 'continue' };
  },
};