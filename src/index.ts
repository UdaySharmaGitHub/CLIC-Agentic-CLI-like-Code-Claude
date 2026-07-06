#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion v4.3
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
import { createClient, streamMessage } from './openai.js';
import { buildSystemPrompt } from './prompts.js';
import { DEFAULT_MODEL, DEFAULT_MAX_STEPS, loadKnowledgeBase, TOKEN_GRAPH_FILE } from './config.js';
import { getMessages, pushMessage, loadHistory, saveHistory, trimToLastUserMessage } from './memory.js';
import { loadGraph, saveGraph, addNode } from './knowledgeGraph.js';
import type { ConfirmFn } from './tools/index.js';
import { fetchAvailableModelOptions } from './tools/listModelfromOpenAI.js';
// Commands
import { executeCommand, isSlashedCommand, slashCompleter, type CommandContext } from './commands/index.js';
import ora from 'ora';
// Pricing for the AI Models
import { loadPricing } from './pricing.js';

// ── State ────────────────────────────────────────────────────────────────────

let showRaw = false;

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command()
  .name('clic')
  .version('4.3.0')
  .description('CLIC — Command Line Intelligence Companion. An agentic CLI powered by OpenAI-compatible APIs.')
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

  // API Key check
  let apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    const keyInput = await password({
      message: 'OpenAI API Key:',
      validate: (val) => (val.length < 5 ? 'Please enter a valid API key' : undefined),
    });
    if (isCancel(keyInput)) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }
    apiKey = keyInput;
    process.env.API_KEY = apiKey;
  } else {
    console.log(chalk.green('  ✅ API_KEY loaded from environment.'));
  }

  // Base URL check
  const isCustomBaseUrl = !!process.env.BASE_URL?.trim();
  console.log(isCustomBaseUrl
    ? chalk.green(`  ✅ Base URL: ${chalk.white('Loaded')}`)
    : chalk.yellow(`  ⚠️  Base URL: ${chalk.white('Not set — using default')}`)
  );

  await loadPricing(); // Preload pricing data for the models
   
  // ── Model selection — fetch live models from the API ──────────────────────
  // Skipped only when --model flag is explicitly passed (differs from default).
  if (opts.model === DEFAULT_MODEL) {
    const spinner = ora({ text: chalk.dim('  Fetching available models...'), color: 'cyan' }).start();
    try {
      const modelOptions = await fetchAvailableModelOptions();
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
        console.log(chalk.yellow(`  ⚠️  No models found. Using default: ${model}`));
      }
    } catch (err) {
      spinner.stop();
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  ⚠️  Could not fetch models (${errMsg}). Using: ${model}`));
    }
  } else {
    console.log(chalk.green(`  ✅ Model: ${chalk.white(model)} (set via --model flag)`));
  }

  // Set CLIC_MODEL so tools (e.g. web_search) can pick it up
  process.env.CLIC_MODEL = model;

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
  let systemPrompt = buildSystemPrompt(knowledgeBase);
  let client = createClient(model);

  // ── Load or initialise history + Knowledge Graph ──────────────────────────
  await loadHistory();
  await loadGraph(TOKEN_GRAPH_FILE);
  const sessionId = `session_${Date.now()}`;
  addNode({ id: sessionId, type: 'session', properties: { model, role: kbFile ?? null }, createdAt: new Date().toISOString() });

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
  const createSingleTurnConfirmFn = (singleRl: readline.Interface): ConfirmFn => {
    if (yolo) return async () => true;
    return async (message: string): Promise<boolean> => {
      try {
        const answer = await singleRl.question(`  ${chalk.yellow('▶')} ${message} (y/n): `);
        return answer.trim().toLowerCase() === 'y';
      } catch {
        console.log(chalk.dim('  Cancelled.'));
        return false;
      }
    };
  };

  // ── Single-turn mode ──────────────────────────────────────────────────────
  if (prompt) {
    const singleRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const singleConfirmFn = createSingleTurnConfirmFn(singleRl);
    pushMessage({ role: 'user', content: prompt });
    await runAgentTurn(client, getMessages(), systemPrompt, {
      model, maxSteps, confirm: singleConfirmFn, showRaw, sessionId,
    });
    await saveHistory();
    await saveGraph(TOKEN_GRAPH_FILE);
    singleRl.close();
    return;
  }

  // ── REPL ──────────────────────────────────────────────────────────────────

  // CRITICAL: Keep the event loop alive with a timer. Readline closing during
  // streaming unrefs stdin, causing Node.js to exit.
  const keepAlive = setInterval(() => {}, 60_000);

  // Idle SIGINT handler — fires when Ctrl+C is pressed outside an agent turn
  let agentRunning = false;
  process.on('SIGINT', async () => {
    if (agentRunning) return; // mid-turn: handled per-turn below
    console.log(chalk.dim('\n  Saving and exiting...'));
    clearInterval(keepAlive);
    await saveHistory();
    await saveGraph(TOKEN_GRAPH_FILE);
    process.exit(0);
  });

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
        try {
          const answer = await ask(`  ${chalk.yellow('▶')} ${message} (y/n): `);
          return answer.trim().toLowerCase() === 'y';
        } catch {
          // Ctrl+C during the prompt — treat as rejection, not a crash
          console.log(chalk.dim('  Cancelled.'));
          return false;
        }
      };

  // Single-shot LLM call injected into CommandContext (used by /compact)
  const callLLM = async (msgs: Parameters<typeof streamMessage>[3]): Promise<string> => {
    let result = '';
    await streamMessage(client, model, '', msgs, (text) => { result += text; });
    return result;
  };

  while (true) {
    let userInput: string;
    try {
      promptPrintSeperator();
      userInput = await ask(`  ${chalk.cyan('❯')} `);
      promptPrintSeperator();
    } catch {
      if (process.stdin.destroyed) {
        clearInterval(keepAlive);
        break;
      }
      continue;
    }

    const trimmed = userInput.trim();

    // ── REPL commands ─────────────────────────────────────────────────────
    if (isSlashedCommand(trimmed)) {
      const ctx: CommandContext = { model, maxSteps, showRaw, kbFile, systemPrompt, yolo, sessionId, callLLM };
      const result = await executeCommand(trimmed, ctx);

      if (result.type === 'exit') {
        clearInterval(keepAlive);
        await saveGraph(TOKEN_GRAPH_FILE);
        break;
      }

      if (result.type === 'update') {
        if (result.updates.showRaw !== undefined) showRaw = result.updates.showRaw;
        if (result.updates.kbFile !== undefined) kbFile = result.updates.kbFile;
        if (result.updates.systemPrompt !== undefined) systemPrompt = result.updates.systemPrompt;
        if (result.updates.model !== undefined && result.updates.model !== model) {
          model = result.updates.model;
          process.env.CLIC_MODEL = model;
          client = createClient(model);
        }
      }

      if (result.type === 'retry') {
        trimToLastUserMessage();
        const retryAc = new AbortController();
        const retryOnSIGINT = () => { retryAc.abort(); process.stdout.write('\n'); };
        agentRunning = true;
        process.once('SIGINT', retryOnSIGINT);
        try {
          await runAgentTurn(client, getMessages(), systemPrompt, {
            model, maxSteps, confirm: confirmFn, showRaw, sessionId, signal: retryAc.signal,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(chalk.red(`  ❌ Error during retry: ${msg}`));
        } finally {
          agentRunning = false;
          process.removeListener('SIGINT', retryOnSIGINT);
        }
        await saveHistory();
        await saveGraph(TOKEN_GRAPH_FILE);
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

    const ac = new AbortController();
    const onSIGINT = () => { ac.abort(); process.stdout.write('\n'); };
    agentRunning = true;
    process.once('SIGINT', onSIGINT);
    try {
      await runAgentTurn(client, getMessages(), systemPrompt, {
        model, maxSteps, confirm: confirmFn, showRaw, sessionId, signal: ac.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ Error during agent turn: ${msg}`));
    } finally {
      agentRunning = false;
      process.removeListener('SIGINT', onSIGINT);
    }

    await saveHistory();
    await saveGraph(TOKEN_GRAPH_FILE);
    console.log();
  }
}
