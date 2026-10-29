/**
 * src/ui/index.ts — UI adapter
 *
 * CLIC is a scrolling-log CLI, so all one-shot output is rendered synchronously
 * via chalk (see fallback.ts): instant, and it scrolls naturally like any log.
 *
 * Ink is reserved for the only two elements that genuinely need live rendering
 * and never overlap other stdout writes:
 *   - the animated startup Banner (runs once, fully awaited before the REPL)
 *   - the transient "Thinking…" spinner (mounted only while the LLM is thinking,
 *     torn down the instant the first token streams)
 *
 * Mixing a persistent Ink live-region with plain console.log during an agent
 * turn corrupts output, so we deliberately avoid it.
 */

import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';

// Ink components (live rendering only)
import { Banner } from './components/Banner.js';
import { ThinkingSpinner } from './components/Spinner.js';

// Synchronous chalk implementations for all static output
import * as fb from './fallback.js';

// Re-export pure helpers (used by callers that import from ui today)
export { actionLabel, sessionNameBadge } from './helpers.js';

// ── TTY guard ────────────────────────────────────────────────────────────────
const isTTY = () => process.stdout.isTTY === true;

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

// ── Static one-shot output — synchronous, scrolls like a log ─────────────────

export function printHelp(): void {
  fb.printHelp();
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
  fb.printStatus(opts);
}

export function printStepHeader(step: number, maxSteps: number): void {
  fb.printStepHeader(step, maxSteps);
}

export function printSeparator(): void {
  fb.printSeparator();
}

export function promptPrintSeperator(sessionName?: string): void {
  fb.promptPrintSeperator(sessionName);
}

export function printToolHeader(toolName: string, detail: string): void {
  fb.printToolHeader(toolName, detail);
}

export function printToolSuccess(message: string): void {
  fb.printToolSuccess(message);
}

export function printToolError(message: string): void {
  fb.printToolError(message);
}

export function printToolBlocked(message: string): void {
  fb.printToolBlocked(message);
}

export function printRejected(): void {
  fb.printRejected();
}

export function printContextBar(promptTokens: number, contextLimit: number, threshold?: number): void {
  fb.printContextBar(promptTokens, contextLimit, threshold);
}

export function printDimOutput(lines: string[], maxLines?: number): void {
  fb.printDimOutput(lines, maxLines);
}
