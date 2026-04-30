#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion v4.2
//
//  Entry point: CLI argument parsing, setup wizard, REPL loop
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { intro, select, password, isCancel, outro } from '@clack/prompts';
import { printBanner, printSeparator, promptPrintSeperator } from './ui.js';
import { runAgentTurn } from './agent.js';
import { createClient, streamMessage } from './gemini.js';
import { buildSystemPrompt } from './prompts.js';
import { DEFAULT_MODEL, DEFAULT_MAX_STEPS, loadKnowledgeBase } from './config.js';
import { getMessages, pushMessage, loadHistory, saveHistory, trimToLastUserMessage } from './memory.js';
import type { ConfirmFn } from './tools/index.js';
import { fetchDeployedModelOptions } from './tools/listModelfromSapAiCore.js';
// Commands
import { executeCommand, isSlashedCommand, slashCompleter, type CommandContext } from './commands/index.js';
import ora from 'ora';

// ── State ────────────────────────────────────────────────────────────────────

let showRaw = false;

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command()
  .name('clic')
  .version('4.2.0')
  .description('CLIC — Command Line Intelligence Companion. An agentic CLI powered by SAP Gen AI Hub.')
  .option('--kb <path>', 'Knowledge base file path for role/persona')
  .option('--model <model>', 'LLM model to use', DEFAULT_MODEL)
  .option('--max-steps <n>', 'Max agent steps per turn', String(DEFAULT_MAX_STEPS))
  .option('--yolo', 'Auto-approve all actions (use with caution!)')
  .argument('[prompt]', 'Optional single-turn prompt (skips REPL)')
  .action(main);

program.parse();

async function main(prompt: string | undefined, opts: {
  kb?: string;
  model: string;
  maxSteps: string;
  yolo?: boolean;
}) {
  let model = opts.model;
  const maxSteps = parseInt(opts.maxSteps, 10) || DEFAULT_MAX_STEPS;
  const yolo = opts.yolo ?? false;

  // ── Banner ────────────────────────────────────────────────────────────────
  await printBanner();

  // ── Setup wizard with @clack/prompts ──────────────────────────────────────
  intro(chalk.cyan.bold(' CLIC Setup '));

  // API Key / Service Key
  let serviceKey = process.env.AICORE_SERVICE_KEY || '';
  if (!serviceKey) {
    const keyInput = await password({
      message: 'SAP AI Core Service Key (JSON):',
      validate: (val) => (val.length < 10 ? 'Please enter a valid service key JSON' : undefined),
    });
    if (isCancel(keyInput)) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }
    serviceKey = keyInput;
    process.env.AICORE_SERVICE_KEY = serviceKey;
  } else {
    console.log(chalk.green('  ✅ AICORE_SERVICE_KEY loaded from environment.'));
  }

  // ── Model selection — fetch live deployments from SAP AI Core ─────────────
  // Skipped only when --model flag is explicitly passed (differs from default).
  if (opts.model === DEFAULT_MODEL) {
    const spinner = ora({ text: chalk.dim('  Fetching available models from SAP AI Core...'), color: 'cyan' }).start();
    try {
      const modelOptions = await fetchDeployedModelOptions();
      spinner.stop();

      if (modelOptions.length > 0) {
        const modelChoice = await select({
          message: 'Select the LLM model to use (↑ ↓ to navigate, Enter to confirm):',
          options: modelOptions,
        });

        if (isCancel(modelChoice)) {
          console.log(chalk.red('  Cancelled.'));
          process.exit(0);
        }

        model = modelChoice as string;
      } else {
        console.log(chalk.yellow(`  ⚠️  No running deployments found. Using default: ${model}`));
      }
    } catch (err) {
      spinner.stop();
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  ⚠️  Could not fetch models (${errMsg}). Using: ${model}`));
    }
  } else {
    console.log(chalk.green(`  ✅ Model: ${chalk.white(model)} (set via --model flag)`));
  }

  // Knowledge Base (optional)
  let knowledgeBase: string | undefined;
  let kbFile = opts.kb;

  if (!kbFile) {
    // Discover role files from "roles based Workflow" folder
    const rolesDir = path.resolve(process.cwd(), 'roles based Workflow');
    const roleOptions: Array<{ value: string; label: string; hint: string }> = [
      { value: '__none__', label: 'None', hint: 'Run as a generic assistant' },
    ];

    try {
      const files = await fs.readdir(rolesDir);
      for (const file of files.filter(f => f.toLowerCase().endsWith('.md'))) {
        const label = file.replace(/\.md$/i, '').replace(/[_-]/g, ' ');
        roleOptions.push({ value: path.join(rolesDir, file), label, hint: file });
      }
    } catch {
      // folder not found — no built-in roles to list
    }

    const roleChoice = await select({
      message: 'Select a role (↑ ↓ to navigate, Enter to confirm):',
      options: roleOptions,
    });

    if (isCancel(roleChoice)) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }

    kbFile = roleChoice === '__none__' ? undefined : (roleChoice as string);
  }

  if (kbFile) {
    const kb = await loadKnowledgeBase(kbFile);
    if (kb) {
      knowledgeBase = kb.content;
      kbFile = kb.file;
    } else {
      kbFile = undefined;
    }
  } else {
    console.log(chalk.yellow('  ⚡ No role file provided. Running as a generic assistant.'));
  }

  outro(chalk.green(' Setup complete '));

  // ── Build system prompt + client ──────────────────────────────────────────
  // Both are `let` so /model and /role can swap them mid-session.
  let systemPrompt = buildSystemPrompt(knowledgeBase);
  let client = createClient(model);

  // ── Load or initialise history ────────────────────────────────────────────
  await loadHistory();

  console.log(chalk.dim(`  System: ${process.platform} (${process.arch}) | Model: ${model}`));
  if (knowledgeBase) {
    console.log(chalk.green(`  📚 Knowledge Base: Active`) + chalk.dim(` (from ${kbFile})`));
  } else {
    console.log(chalk.dim('  📚 Knowledge Base: Not loaded (generic mode)'));
  }
  if (yolo) {
    console.log(chalk.yellow.bold('  ⚠️  YOLO mode: All actions will be auto-approved!'));
  }
  console.log();
  printSeparator();
  console.log(chalk.bold("  🚀 Agent ready! Type your request. (type '/help' for tips)"));
  printSeparator();
  console.log();

  // ── Create confirm function ───────────────────────────────────────────────
  // For single-turn mode only (REPL uses its own below)
  const createSingleTurnConfirmFn = (singleRl: readline.Interface): ConfirmFn => {
    if (yolo) return async () => true;
    return async (message: string): Promise<boolean> => {
      const answer = await singleRl.question(`  ${chalk.yellow('▶')} ${message} (y/n): `);
      return answer.trim().toLowerCase() === 'y';
    };
  };

  // ── Single-turn mode ──────────────────────────────────────────────────────
  if (prompt) {
    const singleRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const singleConfirmFn = createSingleTurnConfirmFn(singleRl);
    pushMessage({ role: 'user', content: prompt });
    await runAgentTurn(client, getMessages(), systemPrompt, {
      model, maxSteps, confirm: singleConfirmFn, showRaw,
    });
    await saveHistory();
    singleRl.close();
    return;
  }

  // ── REPL ──────────────────────────────────────────────────────────────────

  // CRITICAL: Keep the event loop alive with a timer. Readline closing during
  // Gemini streaming unrefs stdin, causing Node.js to exit. This timer ensures
  // the process stays alive until the user explicitly exits.
  const keepAlive = setInterval(() => {}, 60_000);

  // Create a fresh readline for each question — streaming can break a
  // long-lived readline instance, causing it to stop accepting input.
  // The completer fires when the user types Tab after a '/' prefix.
  async function ask(q: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: slashCompleter,
    });
    try {
      return await rl.question(q);
    } finally {
      rl.close();
    }
  }

  const confirmFn: ConfirmFn = yolo
    ? async () => true
    : async (message: string): Promise<boolean> => {
        const answer = await ask(`  ${chalk.yellow('▶')} ${message} (y/n): `);
        return answer.trim().toLowerCase() === 'y';
      };

  // Single-shot LLM call injected into CommandContext (used by /compact)
  const callLLM = async (messages: Parameters<typeof streamMessage>[2]): Promise<string> => {
    let result = '';
    await streamMessage(client, '', messages, (text) => { result += text; });
    return result;
  };

  while (true) {
    let userInput: string;
    try {
      promptPrintSeperator();
      userInput = await ask(`  ${chalk.cyan('❯')} `);
      promptPrintSeperator();
    } catch {
      // Only break if stdin is truly destroyed (Ctrl+D)
      if (process.stdin.destroyed) {
        clearInterval(keepAlive);
        break;
      }
      continue;
    }

    const trimmed = userInput.trim();

    // ── REPL commands ─────────────────────────────────────────────────────
    if (isSlashedCommand(trimmed)) {
      const ctx: CommandContext = { model, maxSteps, showRaw, kbFile, systemPrompt, yolo, callLLM };
      const result = await executeCommand(trimmed, ctx);

      if (result.type === 'exit') {
        clearInterval(keepAlive);
        break;
      }

      if (result.type === 'update') {
        if (result.updates.showRaw !== undefined) showRaw = result.updates.showRaw;
        if (result.updates.kbFile !== undefined) kbFile = result.updates.kbFile;
        if (result.updates.systemPrompt !== undefined) systemPrompt = result.updates.systemPrompt;
        if (result.updates.model !== undefined && result.updates.model !== model) {
          model = result.updates.model;
          client = createClient(model);
        }
      }

      if (result.type === 'retry') {
        // Drop everything after the last user message, then re-run the agent
        trimToLastUserMessage();
        try {
          await runAgentTurn(client, getMessages(), systemPrompt, {
            model, maxSteps, confirm: confirmFn, showRaw,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(chalk.red(`  ❌ Error during retry: ${msg}`));
        }
        await saveHistory();
        console.log();
      }

      continue;
    }

    if (trimmed === '') {
      console.log(chalk.red("  Please enter something. Type '/help' for tips."));
      console.log();
      continue;
    }

    // ── Agent turn ────────────────────────────────────────────────────────
    pushMessage({ role: 'user', content: trimmed });

    try {
      await runAgentTurn(client, getMessages(), systemPrompt, {
        model, maxSteps, confirm: confirmFn, showRaw,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ Error during agent turn: ${msg}`));
    }

    await saveHistory();
    console.log();
  }
}
