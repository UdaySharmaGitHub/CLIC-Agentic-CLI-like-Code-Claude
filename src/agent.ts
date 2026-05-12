// ─────────────────────────────────────────────────────────────────────────────
//  Agent — ReAct loop powered by OpenAI function calling
//
//  How it works:
//    1. User sends a message
//    2. LLM responds with text AND/OR tool_calls
//    3. If tool_calls → execute each tool, send results back as tool messages
//    4. LLM sees results and either calls more tools or gives final answer
//    5. Loop continues until LLM stops calling functions
// ─────────────────────────────────────────────────────────────────────────────

import type OpenAI from 'openai';
import chalk from 'chalk';
import ora from 'ora';
import { streamMessage } from './gemini.js';
import { executeTool, type ConfirmFn } from './tools/index.js';
import type { ChatMessage } from './memory.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  model: string;
  maxSteps: number;
  confirm: ConfirmFn;
  showRaw: boolean;
}

// ── Agentic Loop ─────────────────────────────────────────────────────────────

export async function runAgentTurn(
  client: OpenAI,
  messages: ChatMessage[],
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

    // ── Call LLM with streaming ──────────────────────────────────────────────
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

    // ── Debug: show raw response ─────────────────────────────────────────────
    if (options.showRaw) {
      console.log(chalk.dim('  ── Raw response ──────────────────────────'));
      console.log(JSON.stringify({ text: response.text, toolCalls: response.toolCalls }, null, 2));
      console.log(chalk.dim(`  toolCalls: ${response.toolCalls.length}`));
      console.log(chalk.dim('  ──────────────────────────────────────────'));
    }

    // ── Add assistant message to history ─────────────────────────────────────
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: response.text || undefined,
      ...(response.toolCalls.length > 0 ? { tool_calls: response.toolCalls } : {}),
    };
    messages.push(assistantMsg);

    // ── If no tool calls, the task is complete ───────────────────────────────
    if (response.toolCalls.length === 0) {
      console.log(chalk.green(`  ✔ Task complete after ${steps} step(s).`));
      return;
    }

    // ── Execute tool calls ───────────────────────────────────────────────────
    for (const call of response.toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = {};
      }

      const result = await executeTool(
        call.function.name,
        args,
        options.confirm,
      );

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ result: result.output, error: result.isError }),
      });
    }

    console.log();
    console.log(chalk.dim(`  ↻ Step ${steps} done — feeding results to LLM for next step...`));
  }

  if (steps >= options.maxSteps) {
    console.log();
    console.log(chalk.yellow(`  ⚠️  Reached max steps (${options.maxSteps}). Stopping.`));
  }
}
