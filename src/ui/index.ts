/**
 * src/ui/index.ts — UI adapter
 *
 * CLIC is a full-Ink scrolling-log TUI on a TTY: every one-shot element is a
 * one-shot Ink render (see oneShot) that mounts, flushes one permanent row,
 * then unmounts — so output scrolls naturally like any log. On a non-TTY
 * (pipes, CI, tests) we fall back to the synchronous chalk implementations in
 * fallback.ts.
 *
 * Two elements keep their own render lifecycle because they are genuinely
 * live and never overlap other stdout writes:
 *   - the animated startup Banner (runs once, fully awaited before the REPL)
 *   - the transient "Thinking…" spinner (mounted only while the LLM is
 *     thinking, torn down the instant the first token streams)
 *
 * oneShot renders are serial because callers await them, so a persistent Ink
 * live-region never coexists with another stdout write.
 */

import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';

// Ink components
import { Banner } from './components/Banner.js';
import { ThinkingSpinner } from './components/Spinner.js';
import { Separator, PromptSeparator } from './components/Separator.js';
import { StepHeader } from './components/StepHeader.js';
import { ContextBar } from './components/ContextBar.js';
import { ToolHeader } from './components/ToolHeader.js';
import { ToolResult } from './components/ToolResult.js';
import { DimOutput } from './components/DimOutput.js';
import { Help } from './components/Help.js';
import { Status } from './components/Status.js';

// Synchronous chalk implementations for the non-TTY fallback path
import * as fb from './fallback.js';

// Re-export pure helpers (used by callers that import from ui today)
export { actionLabel, sessionNameBadge } from './helpers.js';

// ── TTY guard ────────────────────────────────────────────────────────────────
const isTTY = () => process.stdout.isTTY === true;

// ── One-shot Ink render ───────────────────────────────────────────────────────
// Mounts the component to stdout, awaits the flush, then unmounts. Produces one
// permanent scrolling row.
//
// _renderQueue is a promise mutex that serialises concurrent oneShot calls.
// When tools run in parallel (Promise.all), all of them call oneShot
// simultaneously. Without the mutex, multiple render() calls hit the same
// stdout before any unmount(), causing Ink's "reusing stdout" warning.
// The mutex chains each call so renders execute one-at-a-time.
let _renderQueue: Promise<void> = Promise.resolve();

async function oneShot(element: React.ReactElement): Promise<void> {
  let resolve!: () => void;
  const prev = _renderQueue;
  _renderQueue = new Promise<void>(r => { resolve = r; });
  try {
    await prev;
    const { waitUntilRenderFlush, unmount } = render(element, { exitOnCtrlC: false });
    await waitUntilRenderFlush();
    unmount();
  } finally {
    resolve();
  }
}

// ── Animated startup banner (Ink; runs once, fully awaited) ──────────────────
export async function printBanner(): Promise<void> {
  if (!isTTY()) return fb.printBanner();
  process.stdout.write('\x1Bc'); // clear screen
  const { waitUntilExit } = render(React.createElement(Banner), { exitOnCtrlC: false });
  await waitUntilExit();
}

// ── Transient "Thinking…" spinner ────────────────────────────────────────────
// Mounted only while the LLM is thinking (nothing else writes to stdout then),
// and torn down by stop() the instant the first token arrives — so the live Ink
// region never coexists with the scrolling log. stop() is idempotent.
export function startSpinner(): { stop: () => void } {
  if (!isTTY()) {
    process.stdout.write(chalk.dim('  ⏳ Thinking...'));
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
      },
    };
  }
  const instance = render(React.createElement(ThinkingSpinner), { exitOnCtrlC: false });
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      instance.clear();
      instance.unmount();
    },
  };
}

// ── Static one-shot output — one Ink render per call, scrolls like a log ─────

export async function printHelp(): Promise<void> {
  if (!isTTY()) return fb.printHelp();
  await oneShot(React.createElement(Help, null));
}

export async function printStatus(opts: {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
  contextLimit: number;
  sessionName?: string;
}): Promise<void> {
  if (!isTTY()) return fb.printStatus(opts);
  await oneShot(React.createElement(Status, opts));
}

export async function printStepHeader(step: number, maxSteps: number): Promise<void> {
  if (!isTTY()) return fb.printStepHeader(step, maxSteps);
  await oneShot(React.createElement(StepHeader, { step, maxSteps }));
}

export async function printSeparator(): Promise<void> {
  if (!isTTY()) return fb.printSeparator();
  await oneShot(React.createElement(Separator, null));
}

export async function promptPrintSeperator(sessionName?: string): Promise<void> {
  if (!isTTY()) return fb.promptPrintSeperator(sessionName);
  await oneShot(React.createElement(PromptSeparator, { sessionName }));
}

export async function printToolHeader(toolName: string, detail: string): Promise<void> {
  if (!isTTY()) return fb.printToolHeader(toolName, detail);
  await oneShot(React.createElement(ToolHeader, { toolName, detail }));
}

export async function printToolSuccess(message: string): Promise<void> {
  if (!isTTY()) return fb.printToolSuccess(message);
  await oneShot(React.createElement(ToolResult, { type: 'success', message }));
}

export async function printToolError(message: string): Promise<void> {
  if (!isTTY()) return fb.printToolError(message);
  await oneShot(React.createElement(ToolResult, { type: 'error', message }));
}

export async function printToolBlocked(message: string): Promise<void> {
  if (!isTTY()) return fb.printToolBlocked(message);
  await oneShot(React.createElement(ToolResult, { type: 'blocked', message }));
}

export async function printRejected(): Promise<void> {
  if (!isTTY()) return fb.printRejected();
  await oneShot(React.createElement(ToolResult, { type: 'rejected' }));
}

export async function printContextBar(
  promptTokens: number,
  contextLimit: number,
  threshold?: number,
): Promise<void> {
  if (!isTTY()) return fb.printContextBar(promptTokens, contextLimit, threshold);
  await oneShot(React.createElement(ContextBar, { promptTokens, contextLimit, threshold }));
}

export async function printDimOutput(lines: string[], maxLines?: number): Promise<void> {
  if (!isTTY()) return fb.printDimOutput(lines, maxLines);
  await oneShot(React.createElement(DimOutput, { lines, maxLines }));
}
