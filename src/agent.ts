// ─────────────────────────────────────────────────────────────────────────────
//  Agent — ReAct loop powered by Google Gemini function calling
//
//  How it works:
//    1. User sends a message
//    2. Gemini responds with text AND/OR functionCall parts
//    3. If functionCall → execute each tool, send results back as functionResponse
//    4. Gemini sees results and either calls more tools or gives final answer
//    5. Loop continues until Gemini stops calling functions
//
//  Key difference from the bash/Gemini version (setup.sh):
//    - Uses native function calling API instead of manual JSON parsing
//    - No manual "done" flag needed — Gemini's function calling flow handles it
//    - Streaming support for real-time text output
// ─────────────────────────────────────────────────────────────────────────────

import type { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import ora from 'ora';
import { streamMessage } from './gemini.js';
import { executeTool, type ConfirmFn } from './tools/index.js';
import type { MessageParam, Part } from './memory.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  model: string;
  maxSteps: number;
  confirm: ConfirmFn;
  showRaw: boolean;
}

// ── Agentic Loop ─────────────────────────────────────────────────────────────

export async function runAgentTurn(
  client: GoogleGenerativeAI,
  messages: MessageParam[],
  systemPrompt: string,
  options: AgentOptions,
): Promise<void> {
  let steps = 0;

  while (steps < options.maxSteps) {
    steps++;

    if (steps > 1) {
      console.log();
      console.log(chalk.cyan.bold(`  ┌─ Step ${steps} / ${options.maxSteps} ──────────────────────────────────┐`));
    }

    // ── Call Gemini with streaming ───────────────────────────────────────────
    const spinner = ora({ text: '  Thinking...', indent: 2 }).start();

    let response;
    try {
      let textStarted = false;
      response = await streamMessage(client, options.model, systemPrompt, messages, (text) => {
        if (!textStarted) {
          spinner.stop();
          textStarted = true;
          console.log();
          console.log(chalk.cyan.bold('  🤖 Agent:'));
          console.log();
        }
        process.stdout.write(text);
      });

      if (!textStarted) spinner.stop();
      if (textStarted) {
        console.log();
        console.log();
      }
    } catch (err: unknown) {
      spinner.stop();
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ API Error: ${msg}`));
      return;
    }

    // ── Debug: show raw response ──────────────────────────────────────────
    if (options.showRaw) {
      console.log(chalk.dim('  ── Raw response ──────────────────────────'));
      console.log(JSON.stringify(response.parts, null, 2));
      console.log(chalk.dim(`  functionCalls: ${response.functionCalls.length}`));
      console.log(chalk.dim('  ──────────────────────────────────────────'));
    }

    // ── Add model message to history ──────────────────────────────────────
    messages.push({ role: 'model', parts: response.parts });

    // ── If no function calls, the task is complete ──────────────────────────
    if (response.functionCalls.length === 0) {
      console.log(chalk.green(`  ✔ Task complete after ${steps} step(s).`));
      return;
    }

    // ── Execute function calls ────────────────────────────────────────────
    const functionResponses: Part[] = [];

    for (const call of response.functionCalls) {
      const result = await executeTool(
        call.name,
        call.args,
        options.confirm,
      );

      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result: result.output, error: result.isError },
        },
      });
    }

    // ── Feed function results back to Gemini ──────────────────────────────
    messages.push({ role: 'user', parts: functionResponses });

    console.log();
    console.log(chalk.dim(`  ↻ Step ${steps} done — feeding results to Gemini for next step...`));
  }

  if (steps >= options.maxSteps) {
    console.log();
    console.log(chalk.yellow(`  ⚠️  Reached max steps (${options.maxSteps}). Stopping.`));
  }
}
