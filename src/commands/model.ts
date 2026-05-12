// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Model Command
//  This command allows the user to switch the active LLM model mid-session, either by specifying a model name or selecting from available deployments.
//   Usage: /model [model-name]
//          /model (to select from list)
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import ora from 'ora';
import { fetchAvailableModelOptions } from '../tools/listModelfromOpenAI.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/model',
  aliases: ['/m'],
  description: 'Switch the active LLM model mid-session',
  usage: '/model [model-name]',
  execute: async (ctx, args) => {
    if (args?.trim()) {
      const newModel = args.trim();
      console.log(chalk.green(`  ✅ Model switched: ${chalk.dim(ctx.model)} → ${chalk.white(newModel)}`));
      console.log();
      return { type: 'update', updates: { model: newModel } };
    }

    const spinner = ora({ text: chalk.dim('  Fetching available models...'), color: 'cyan' }).start();
    let modelOptions: Array<{ value: string; label: string; hint: string }> = [];

    try {
      modelOptions = await fetchAvailableModelOptions();
      spinner.stop();
    } catch (err) {
      spinner.stop();
      console.log(chalk.yellow(`  ⚠️  Could not fetch models: ${err instanceof Error ? err.message : String(err)}`));
      console.log(chalk.dim(`  Current model: ${ctx.model}`));
      console.log();
      return { type: 'continue' };
    }

    if (modelOptions.length === 0) {
      console.log(chalk.yellow('  ⚠️  No running deployments found.'));
      console.log();
      return { type: 'continue' };
    }

    const choice = await select({
      message: `Select a model (current: ${ctx.model}):`,
      options: modelOptions,
    });

    if (isCancel(choice)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }

    const newModel = choice as string;
    console.log(chalk.green(`  ✅ Model switched: ${chalk.dim(ctx.model)} → ${chalk.white(newModel)}`));
    console.log();
    return { type: 'update', updates: { model: newModel } };
  },
};
