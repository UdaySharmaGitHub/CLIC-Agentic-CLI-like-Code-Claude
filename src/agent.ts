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
import { printStepHeader, actionLabel } from './ui.js';
import { addNode, addEdge } from './knowledgeGraph.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  model: string;
  maxSteps: number;
  confirm: ConfirmFn;
  showRaw: boolean;
  sessionId?: string;
  signal?: AbortSignal;
}

// ── Tool Output Truncation ───────────────────────────────────────────────────

const MAX_TOOL_OUTPUT = 12_000;

function tryMinifyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s)); } catch { return s; }
}

function truncateOutput(output: string): string {
  const normalized = tryMinifyJson(output);
  if (normalized.length <= MAX_TOOL_OUTPUT) return normalized;
  const half = MAX_TOOL_OUTPUT / 2;
  const omitted = normalized.length - MAX_TOOL_OUTPUT;
  return (
    normalized.slice(0, half) +
    `\n[...${omitted} chars omitted — use a more targeted command to see specific parts...]\n` +
    normalized.slice(-half)
  );
}

// ── Agentic Loop ─────────────────────────────────────────────────────────────

function getToolDetail(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read_file':      return `${args.filepath ?? ''}`;
    case 'write_file':     return `${args.filepath ?? ''}`;
    case 'append_file':    return `${args.filepath ?? ''}`;
    case 'modify_file':    return `${args.filepath ?? ''}`;
    case 'list_directory': return `${args.dirpath ?? ''}`;
    case 'run_command':    return `[${args.terminal ?? 'main'}] $ ${args.command ?? ''}`;
    case 'search_files':   return `pattern: ${args.pattern ?? ''}`;
    case 'web_search':     return `${args.query ?? ''}`;
    case 'github':         return `${String(args.username ?? args.action ?? '')}`;
    case 'terminal':       return `${args.action ?? ''}${args.name ? ` "${args.name}"` : ''}${args.command ? ` — ${String(args.command).slice(0, 40)}` : ''}`;
    default:               return JSON.stringify(args).slice(0, 60);
  }
}

export async function runAgentTurn(
  client: OpenAI,
  messages: ChatMessage[],
  systemPrompt: string,
  options: AgentOptions,
): Promise<{ promptTokens: number }> {
  let steps = 0;

  // Accumulated token usage and tool names across all steps in this turn
  const cumulativeUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const usedToolNames = new Set<string>();

  while (steps < options.maxSteps) {
    steps++;

    // ── Check for abort before each step ────────────────────────────────────
    if (options.signal?.aborted) {
      console.log(chalk.yellow('\n  ⚡ Interrupted.'));
        return { promptTokens: cumulativeUsage.promptTokens };
    }

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
      }, options.signal);

      if (!textStarted) spinner.stop();
      if (textStarted) {
        console.log();
        console.log();
      }
    } catch (err: unknown) {
      spinner.stop();
      if (options.signal?.aborted) {
        console.log(chalk.yellow('\n  ⚡ Interrupted.'));
        return { promptTokens: cumulativeUsage.promptTokens };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ API Error: ${msg}`));
      return { promptTokens: cumulativeUsage.promptTokens };
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
    if (response.toolCalls.length > 1) {

      // Parse args for all calls up front
      const pendingCalls = response.toolCalls.map((call) => {
        usedToolNames.add(call.function.name);
        let args: Record<string, unknown>;
        try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
        return { call, args };
      });

      // Print compact queue preview — one line per tool
      console.log();
      console.log(chalk.dim(`  ┄ ${pendingCalls.length} tools queued ┄`.padEnd(47, '┄')));
      for (const { call, args } of pendingCalls) {
        const detail = getToolDetail(call.function.name, args);
        console.log(`    ${actionLabel(call.function.name)}  ${chalk.dim('→')} ${chalk.dim(detail)}`);
      }
      console.log(chalk.dim(`  ${'┄'.repeat(45)}`));
      console.log();

      // Single prompt: parallel or sequential?
      const runParallel = await options.confirm(
        `Run all ${pendingCalls.length} tools in parallel?`,
      );

      if (runParallel) {
        // ── Parallel path ────────────────────────────────────────────────
        console.log(chalk.dim(`  ⚡ Running ${pendingCalls.length} tools in parallel...`));

        // User already consented via "Run all N tools in parallel? y" above.
        // Auto-approve individual tool confirms — asking again per-tool while
        // concurrent tools are already printing output would garble the terminal.
        const settled = await Promise.all(
          pendingCalls.map(async ({ call, args }) => {
            const result = await executeTool(call.function.name, args, async () => true);
            return { id: call.id, result };
          }),
        );

        // Push results in original call order (required by OpenAI API)
        const resultMap = new Map(settled.map(({ id, result }) => [id, result]));
        for (const { call } of pendingCalls) {
          const result = resultMap.get(call.id)!;
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ result: truncateOutput(result.output), error: result.isError }),
          });
        }
      } else {
        // ── Sequential path ──────────────────────────────────────────────
        for (const { call, args } of pendingCalls) {
          const result = await executeTool(call.function.name, args, options.confirm);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ result: truncateOutput(result.output), error: result.isError }),
          });
        }
      }
    } else {
      // Single tool — no preview, no prompt, run directly
      const call = response.toolCalls[0];
      usedToolNames.add(call.function.name);
      let args: Record<string, unknown>;
      try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
      const result = await executeTool(call.function.name, args, options.confirm);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ result: truncateOutput(result.output), error: result.isError }),
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

  return { promptTokens: cumulativeUsage.promptTokens };
}
