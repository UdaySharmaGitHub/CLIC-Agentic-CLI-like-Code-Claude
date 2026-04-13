#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion v4.2
//
//  Entry point: CLI argument parsing, setup wizard, REPL loop
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import type { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { intro, select, password, isCancel, outro } from '@clack/prompts';
import { printBanner, printHelp, printStatus, printSeparator } from './ui.js';
import { runAgentTurn, type AgentOptions } from './agent.js';
import { createClient } from './gemini.js';
import { buildSystemPrompt } from './prompts.js';
import { DEFAULT_MODEL, DEFAULT_MAX_STEPS, HISTORY_FILE, loadKnowledgeBase } from './config.js';
import { getMessages, pushMessage, clearMessages, messageCount, loadHistory, saveHistory } from './memory.js';
import type { ConfirmFn } from './tools/index.js';

// ── State ────────────────────────────────────────────────────────────────────

let showRaw = false;

// ── Slash commands + completer ───────────────────────────────────────────────

const SLASH_COMMANDS = ['/exit', '/quit', '/clear', '/history', '/status', '/help', '/raw'];

function slashCompleter(line: string): [string[], string] {
  if (line.startsWith('/')) {
    const hits = SLASH_COMMANDS.filter(c => c.startsWith(line));
    return [hits.length ? hits : SLASH_COMMANDS, line];
  }
  return [[], line];
}

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command()
  .name('clic')
  .version('4.2.0')
  .description('CLIC — Command Line Intelligence Companion. An agentic CLI powered by Gemini.')
  .option('--kb <path>', 'Knowledge base file path for role/persona')
  .option('--model <model>', 'Gemini model to use', DEFAULT_MODEL)
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
  const model = opts.model;
  const maxSteps = parseInt(opts.maxSteps, 10) || DEFAULT_MAX_STEPS;
  const yolo = opts.yolo ?? false;

  // ── Banner ────────────────────────────────────────────────────────────────
  printBanner();

  // ── Setup wizard with @clack/prompts ──────────────────────────────────────
  intro(chalk.cyan.bold(' CLIC Setup '));

  // API Key
  let apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    const keyInput = await password({
      message: 'Gemini API Key:',
      validate: (val) => (val.length < 10 ? 'Please enter a valid API key' : undefined),
    });
    if (isCancel(keyInput)) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }
    apiKey = keyInput;
  } else {
    console.log(chalk.green('  ✅ API key loaded from environment.'));
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

  // ── Expose config to process.env so tools (e.g. web_search) can access them
  process.env.GEMINI_API_KEY = apiKey;
  process.env.GEMINI_MODEL = model;

  // ── Build system prompt + client ──────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(knowledgeBase);
  const client = createClient(apiKey);

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
    pushMessage({ role: 'user', parts: [{ text: prompt }] });
    await runAgentTurn(client, getMessages(), systemPrompt, {
      model, maxSteps, confirm: singleConfirmFn, showRaw,
    });
    await saveHistory();
    singleRl.close();
    return;
  }

  // ── REPL ──────────────────────────────────────────────────────────────────
  let exiting = false;

  // CRITICAL: Keep the event loop alive with a timer. Readline closing during
  // Gemini streaming unrefs stdin, causing Node.js to exit. This timer ensures
  // the process stays alive until the user explicitly exits.
  const keepAlive = setInterval(() => {}, 60_000);

  // Create a fresh readline for each question — streaming can break a
  // long-lived readline instance, causing it to stop accepting input.
  // The completer fires when the user types Tab after a '/' prefix.
  async function ask(prompt: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: slashCompleter,
    });
    try {
      return await rl.question(prompt);
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

  while (true) {
    if (exiting) break;

    let userInput: string;
    try {
      console.log(chalk.bold('  🧑 You:'));
      userInput = await ask('  > ');
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
    if (trimmed === '/exit' || trimmed === '/quit') {
      exiting = true;
      await saveHistory();
      console.log();
      console.log(chalk.green(`  ✅ History saved → ${HISTORY_FILE}`));
      console.log(chalk.cyan('  👋 Goodbye!'));
      console.log();
      clearInterval(keepAlive);
      break;
    }

    if (trimmed === '/clear') {
      clearMessages();
      await saveHistory();
      console.log(chalk.yellow('  🗑️  History cleared.'));
      console.log();
      continue;
    }

    if (trimmed === '/history') {
      const msgs = getMessages();
      if (msgs.length === 0) {
        console.log(chalk.dim('  No history yet.'));
      } else {
        console.log();
        console.log(chalk.cyan.bold(`  📜 Chat History (${msgs.length} messages):`));
        printSeparator();
        for (const msg of msgs) {
          const role = msg.role === 'user' ? '🧑 You' : '🤖 AI';
          const contentStr = msg.parts
            ?.map(p => ('text' in p && p.text) ? p.text : '')
            .filter(Boolean)
            .join(' ') || '[function call/response]';
          const preview = contentStr.split('\n')[0]?.slice(0, 100) || '[function call/response]';
          console.log(`  ${role}: ${preview}`);
        }
        printSeparator();
      }
      console.log();
      continue;
    }

    if (trimmed === '/status') {
      printStatus({
        messageCount: messageCount(),
        maxSteps,
        showRaw,
        kbFile,
        model,
      });
      continue;
    }

    if (trimmed === '/help') {
      printHelp();
      continue;
    }

    if (trimmed === '/raw') {
      showRaw = !showRaw;
      console.log(showRaw
        ? chalk.yellow('  Debug JSON output: ON (type \'/raw\' again to turn off)')
        : chalk.dim('  Debug JSON output: OFF'));
      console.log();
      continue;
    }

    if (trimmed === '') {
      console.log(chalk.red("  Please enter something. Type '/help' for tips."));
      console.log();
      continue;
    }

    // ── Agent turn ────────────────────────────────────────────────────────
    pushMessage({ role: 'user', parts: [{ text: trimmed }] });

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
