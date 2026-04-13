// ─────────────────────────────────────────────────────────────────────────────
//  Gemini — Google Generative AI SDK wrapper
// ─────────────────────────────────────────────────────────────────────────────

import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
  type Content,
} from '@google/generative-ai';
import type { ToolDefinition } from './tools/types.js';
import type { MessageParam, Part } from './memory.js';
import { getToolDefinitions } from './tools/index.js';

export function createClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

// ── Convert our ToolDefinition format to Gemini FunctionDeclaration format ───

const TYPE_MAP: Record<string, SchemaType> = {
  string: SchemaType.STRING,
  number: SchemaType.NUMBER,
  integer: SchemaType.INTEGER,
  boolean: SchemaType.BOOLEAN,
  array: SchemaType.ARRAY,
  object: SchemaType.OBJECT,
};

function toFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([key, val]) => [key, {
          type: TYPE_MAP[val.type] ?? SchemaType.STRING,
          description: val.description,
        }]),
      ),
      required: t.parameters.required,
    },
  }));
}

// ── Response type ────────────────────────────────────────────────────────────

export interface GeminiResponse {
  parts: Part[];
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>;
  text: string;
}

// ── Stream a message to Gemini and return structured response ────────────────

export async function streamMessage(
  client: GoogleGenerativeAI,
  model: string,
  systemPrompt: string,
  messages: MessageParam[],
  onText: (text: string) => void,
): Promise<GeminiResponse> {
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: toFunctionDeclarations(getToolDefinitions()) }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });

  // Cast our MessageParam[] to Content[] (structurally identical at runtime)
  const result = await genModel.generateContentStream({
    contents: messages as unknown as Content[],
  });

  let fullText = '';
  for await (const chunk of result.stream) {
    try {
      const text = chunk.text();
      if (text) {
        onText(text);
        fullText += text;
      }
    } catch {
      // chunk.text() throws if the chunk has no text part (e.g. pure function call)
    }
  }

  const response = await result.response;
  const candidateParts = response.candidates?.[0]?.content?.parts ?? [];

  // Convert SDK parts to our Part type
  const parts: Part[] = [];
  const functionCalls: GeminiResponse['functionCalls'] = [];

  for (const p of candidateParts) {
    if ('text' in p && p.text) {
      parts.push({ text: p.text });
    }
    if ('functionCall' in p && p.functionCall) {
      const fc = p.functionCall;
      const args = (fc.args ?? {}) as Record<string, unknown>;
      parts.push({ functionCall: { name: fc.name, args } });
      functionCalls.push({ name: fc.name, args });
    }
  }

  return { parts, functionCalls, text: fullText };
}
