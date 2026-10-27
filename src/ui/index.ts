/**
 * src/ui/index.ts — Adapter shims
 *
 * Exports the same public API as the original src/ui.ts.
 * Routes to Ink components when stdout is a real TTY; falls back to
 * the chalk-based implementations in fallback.ts for piped output,
 * --paste mode, and CI environments.
 */

import React from 'react';
import { render } from 'ink';

// Components
import { Banner } from './components/Banner.js';
import { Help } from './components/Help.js';
import { Status } from './components/Status.js';
import { StepHeader } from './components/StepHeader.js';
import { ContextBar } from './components/ContextBar.js';
import { ToolHeader } from './components/ToolHeader.js';
import { ToolResult } from './components/ToolResult.js';
import { Separator, PromptSeparator } from './components/Separator.js';
import { DimOutput } from './components/DimOutput.js';

// Fallback (non-TTY)
import * as fb from './fallback.js';

// Re-export pure helpers (used by callers that import from ui.ts today)
export { actionLabel, sessionNameBadge } from './helpers.js';

// ── TTY guard ────────────────────────────────────────────────────────────────
// Ink requires a real TTY. Fall back to chalk for piped output, --paste, CI.
const isTTY = () => process.stdout.isTTY === true;

// ── One-shot render helper ───────────────────────────────────────────────────
async function runOneShot(element: React.ReactElement): Promise<void> {
  const { waitUntilRenderFlush, unmount } = render(element, { exitOnCtrlC: false });
  await waitUntilRenderFlush();
  unmount();
}

// ── Public API — identical signatures to original src/ui.ts ─────────────────

export async function printBanner(): Promise<void> {
  if (!isTTY()) return fb.printBanner();
  process.stdout.write('\x1Bc'); // clear screen (equivalent to console.clear())
  const { waitUntilExit } = render(React.createElement(Banner), { exitOnCtrlC: false });
  await waitUntilExit();
}

export function printHelp(): void {
  if (!isTTY()) return fb.printHelp();
  void runOneShot(React.createElement(Help));
}

export function printStatus(opts: {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
  contextLimit: number;
  sessionName?: string;
}): void {
  if (!isTTY()) return fb.printStatus(opts);
  void runOneShot(React.createElement(Status, opts));
}

export function printStepHeader(step: number, maxSteps: number): void {
  if (!isTTY()) return fb.printStepHeader(step, maxSteps);
  void runOneShot(React.createElement(StepHeader, { step, maxSteps }));
}

export function printSeparator(): void {
  if (!isTTY()) return fb.printSeparator();
  void runOneShot(React.createElement(Separator));
}

export function promptPrintSeperator(sessionName?: string): void {
  if (!isTTY()) return fb.promptPrintSeperator(sessionName);
  void runOneShot(React.createElement(PromptSeparator, { sessionName }));
}

export function printToolHeader(toolName: string, detail: string): void {
  if (!isTTY()) return fb.printToolHeader(toolName, detail);
  void runOneShot(React.createElement(ToolHeader, { toolName, detail }));
}

export function printToolSuccess(message: string): void {
  if (!isTTY()) return fb.printToolSuccess(message);
  void runOneShot(React.createElement(ToolResult, { type: 'success', message }));
}

export function printToolError(message: string): void {
  if (!isTTY()) return fb.printToolError(message);
  void runOneShot(React.createElement(ToolResult, { type: 'error', message }));
}

export function printToolBlocked(message: string): void {
  if (!isTTY()) return fb.printToolBlocked(message);
  void runOneShot(React.createElement(ToolResult, { type: 'blocked', message }));
}

export function printRejected(): void {
  if (!isTTY()) return fb.printRejected();
  void runOneShot(React.createElement(ToolResult, { type: 'rejected' }));
}

export function printContextBar(promptTokens: number, contextLimit: number, threshold?: number): void {
  if (!isTTY()) return fb.printContextBar(promptTokens, contextLimit, threshold);
  void runOneShot(React.createElement(ContextBar, { promptTokens, contextLimit, threshold }));
}

export function printDimOutput(lines: string[], maxLines?: number): void {
  if (!isTTY()) return fb.printDimOutput(lines, maxLines);
  void runOneShot(React.createElement(DimOutput, { lines, maxLines }));
}
