// ─────────────────────────────────────────────────────────────────────────────
//  Commands — shared types
// This file defines shared TypeScript types and interfaces for command implementations.
//  Each command module (e.g. model.ts, compact.ts) implements the SlashCommand interface defined here.
//  The CommandContext provides necessary information and utilities for command execution.
//  The CommandAction type defines possible outcomes of executing a command, such as updating context or exiting.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatMessage } from '../memory.js';

export interface CommandContext {
  model: string;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  systemPrompt?: string;
  yolo?: boolean;
  /** Single-shot LLM call injected by index.ts — used by /compact */
  callLLM?: (messages: ChatMessage[]) => Promise<string>;
}

export type CommandAction =
  | { type: 'continue' }
  | { type: 'exit' }
  | { type: 'retry' }
  | { type: 'update'; updates: Partial<CommandContext> };

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  execute: (ctx: CommandContext, args?: string) => Promise<CommandAction>;
}
