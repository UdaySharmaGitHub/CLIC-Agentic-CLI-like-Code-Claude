// ─────────────────────────────────────────────────────────────────────────────
//  LLM — SAP Gen AI Hub (Orchestration Service) wrapper
// ─────────────────────────────────────────────────────────────────────────────

import { OrchestrationClient } from '@sap-ai-sdk/orchestration';
import type {
  ChatCompletionTool,
} from '@sap-ai-sdk/orchestration';
import type { ChatMessage, ToolCall } from './memory.js';
import { getToolDefinitions } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

// ── Convert our ToolDefinition format to ChatCompletionTool format ───────────

function toChatCompletionTools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
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

// ── Create an OrchestrationClient ────────────────────────────────────────────

export function createClient(model: string): OrchestrationClient {
  return new OrchestrationClient({
    promptTemplating: {
      model: {
        name: model,
        params: {
          max_completion_tokens: 8192,
          temperature: 0.3,
        },
      },
      prompt: {
        tools: toChatCompletionTools(getToolDefinitions()),
      },
    },
  });
}

// ── Response type ────────────────────────────────────────────────────────────

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
}

// ── Stream a message and return structured response ──────────────────────────

export async function streamMessage(
  client: OrchestrationClient,
  systemPrompt: string,
  messages: ChatMessage[],
  onText: (text: string) => void,
): Promise<LLMResponse> {
  // Split: system prompt + history as messagesHistory, empty messages
  // The system prompt is injected as the first message in history
  const allMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  // Use the last message as `messages`, rest as `messagesHistory`
  const lastMsg = allMessages[allMessages.length - 1];
  const history = allMessages.slice(0, -1);

  const streamResponse = await client.stream({
    messages: [lastMsg as any],
    messagesHistory: history as any[],
  });

  let fullText = '';
  const toolCallChunksMap = new Map<number, { id: string; name: string; arguments: string }>();

  for await (const chunk of streamResponse.stream) {
    const deltaContent = chunk.getDeltaContent();
    if (deltaContent) {
      onText(deltaContent);
      fullText += deltaContent;
    }

    // Accumulate tool call chunks
    const deltaToolCalls = chunk.getDeltaToolCalls();
    if (deltaToolCalls) {
      for (const tc of deltaToolCalls) {
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

  // Collect final tool calls — prefer aggregated stream data or fall back to response helper
  let toolCalls: ToolCall[] = [];

  const finalToolCalls = streamResponse.getToolCalls() as Array<{ id: string; type: string; function: { name: string; arguments: string } }> | undefined;
  if (finalToolCalls && finalToolCalls.length > 0) {
    toolCalls = finalToolCalls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  } else if (toolCallChunksMap.size > 0) {
    toolCalls = Array.from(toolCallChunksMap.values()).map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }));
  }

  return { text: fullText, toolCalls };
}
