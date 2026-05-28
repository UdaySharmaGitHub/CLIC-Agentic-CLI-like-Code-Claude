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
import { streamMessage } from './openai.js';
import { executeTool, type ConfirmFn } from './tools/index.js';
import type { ChatMessage } from './memory.js';
import { printStepHeader } from './ui.js';
import { addNode, addEdge } from './knowledgeGraph.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  model: string;
  maxSteps: number;
  confirm: ConfirmFn;
  showRaw: boolean;
  sessionId?: string;
}

// ── Agentic Loop ─────────────────────────────────────────────────────────────

export async function runAgentTurn(
  client: OpenAI,
  messages: ChatMessage[],
  systemPrompt: string,
  options: AgentOptions,
): Promise<void> {
  let steps = 0;

  // Accumulated token usage and tool names across all steps in this turn
  const cumulativeUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const usedToolNames = new Set<string>();

  while (steps < options.maxSteps) {
    steps++;

    if (steps > 1) {
      printStepHeader(steps, options.maxSteps);
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

    // ── Accumulate token usage for KG ────────────────────────────────────────
    if (response.usage) {
      cumulativeUsage.promptTokens     += response.usage.promptTokens;
      cumulativeUsage.completionTokens += response.usage.completionTokens;
      cumulativeUsage.totalTokens      += response.usage.totalTokens;
    }

    // ── If no tool calls, the task is complete ───────────────────────────────
    if (response.toolCalls.length === 0) {
      console.log(chalk.green(`  ✔ Task complete after ${steps} step(s).`));
      break;
    }

    // ── Execute tool calls ───────────────────────────────────────────────────
    for (const call of response.toolCalls) {
      usedToolNames.add(call.function.name);
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

  // ── Record this turn in the Knowledge Graph ──────────────────────────────
  if (options.sessionId) {
    const now = new Date().toISOString();
    const turnId = `turn_${options.sessionId}_${Date.now()}`;

    addNode({ id: turnId, type: 'turn', properties: { steps }, createdAt: now });
    addEdge({ from: options.sessionId, to: turnId, type: 'HAS_TURN' });

    const modelId = `model_${options.model}`;
    addNode({ id: modelId, type: 'model', properties: { name: options.model }, createdAt: now });
    addEdge({ from: turnId, to: modelId, type: 'USED_MODEL' });

    // Estimate tokens from chars (~4 chars/token) when the API didn't return usage
    const hasActualUsage = cumulativeUsage.totalTokens > 0;
    const usageToRecord = hasActualUsage
      ? { ...cumulativeUsage, source: 'actual' as const }
      : (() => {
          const promptChars  = messages.slice(0, -1).reduce((sum, m) => sum + ('content' in m && typeof m.content === 'string' ? m.content.length : 0), 0)
                             + (systemPrompt?.length ?? 0);
          const completionChars = messages[messages.length - 1] && 'content' in messages[messages.length - 1]
            ? (messages[messages.length - 1] as { content?: string }).content?.length ?? 0
            : 0;
          const p = Math.ceil(promptChars / 4);
          const c = Math.ceil(completionChars / 4);
          return { promptTokens: p, completionTokens: c, totalTokens: p + c, source: 'estimated' as const };
        })();

    const usageId = `usage_${turnId}`;
    addNode({ id: usageId, type: 'token_usage', properties: usageToRecord, createdAt: now });
    addEdge({ from: turnId, to: usageId, type: 'HAS_USAGE' });

    for (const toolName of usedToolNames) {
      const toolId = `tool_${toolName}`;
      addNode({ id: toolId, type: 'tool', properties: { name: toolName }, createdAt: now });
      addEdge({ from: turnId, to: toolId, type: 'CALLED_TOOL' });
    }
  }
}
