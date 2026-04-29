import chalk from 'chalk';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/raw',
  description: 'Toggle raw JSON debug output',
  execute: async (ctx) => {
    const newVal = !ctx.showRaw;
    console.log(newVal
      ? chalk.yellow("  Debug JSON output: ON (type '/raw' again to turn off)")
      : chalk.dim('  Debug JSON output: OFF'));
    console.log();
    return { type: 'update', updates: { showRaw: newVal } };
  },
};