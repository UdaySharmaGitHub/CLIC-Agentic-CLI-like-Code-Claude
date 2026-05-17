// ─────────────────────────────────────────────────────────────────────────────
//  LLM — OpenAI-compatible API wrapper
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatMessage, ToolCall } from './memory.js';
import { getToolDefinitions } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

// ── Convert our ToolDefinition format to ChatCompletionTool ─────────────────

function toChatCompletionTools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([key, val]) => [key, {
            type: val.type,
            description: val.description,
          }]),
        ),
        required: t.parameters.required,
      },
    },
  }));
}

// ── Create an OpenAI client ──────────────────────────────────────────────────

export function createClient(_model: string): OpenAI {
  return new OpenAI({
    apiKey: process.env.API_KEY ?? '',
    baseURL: process.env.BASE_URL?.trim() ?? 'https://api.openai.com/v1',
  });
}

// ── Response type ────────────────────────────────────────────────────────────

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
}

// ── Stream a message and return structured response ──────────────────────────

export async function streamMessage(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  onText: (text: string) => void,
): Promise<LLMResponse> {
  const allMessages: ChatCompletionMessageParam[] = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...messages as ChatCompletionMessageParam[],
  ];

  const tools = toChatCompletionTools(getToolDefinitions());

  const stream = await client.chat.completions.create({
    model,
    messages: allMessages,
    tools,
    tool_choice: 'auto',
    stream: true,
    max_tokens: 8192,
    temperature: 0.3,
  });

  let fullText = '';
  const toolCallChunksMap = new Map<number, { id: string; name: string; arguments: string }>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      onText(delta.content);
      fullText += delta.content;
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = toolCallChunksMap.get(tc.index);
        if (existing) {
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          if (tc.function?.name) existing.name += tc.function.name;
        } else {
          toolCallChunksMap.set(tc.index, {
            id: tc.id ?? '',
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
          });
        }
      }
    }
  }

  const toolCalls: ToolCall[] = Array.from(toolCallChunksMap.values()).map(tc => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: tc.arguments,
    },
  }));

  return { text: fullText, toolCalls };
}
