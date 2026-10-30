# Ink TUI Phase 3 — Full Ink Scrolling-Log Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all remaining synchronous chalk `print*` calls in `src/ui/index.ts` (TTY path) with one-shot Ink component renders, completing the full Ink TUI migration.

**Architecture:** A new private `oneShot(element)` async helper in `src/ui/index.ts` mounts an Ink component, awaits `waitUntilRenderFlush()`, then unmounts — producing one permanent scroll row per call. Every `print*` function becomes `async Promise<void>` with a TTY→`oneShot(Component)` path and a non-TTY→`fallback.ts` chalk path. All callers across `agent.ts`, `index.ts`, `src/tools/`, and `src/commands/` gain `await` at existing call sites.

**Tech Stack:** Ink 8, React 19 (already installed), TypeScript ESM NodeNext, existing component library from Phase 1 (`src/ui/components/`)

## Global Constraints

- ESM project — every local import uses `.js` extension even when the source is `.ts`
- Never have two concurrent Ink renders for the same stdout — `oneShot` is naturally serial since callers `await` it; the ThinkingSpinner is always stopped before any `print*` call (guaranteed by Phase 2 architecture)
- `pnpm build` must produce a clean `dist/` with 0 TypeScript errors before each commit
- `pnpm test` (all suites) must pass before each commit — currently 234 tests; Task 1 adds 6 more (total 240)
- `src/ui/fallback.ts` is **NOT modified** — it remains the non-TTY chalk implementation unchanged
- No new components — the Phase 1 component library is complete; Phase 3 only wires them in
- YAGNI — add `await` at existing call sites; do not refactor surrounding code
- `printBanner()` is already async Ink and is **NOT changed**
- `startSpinner()` is a transient live region (sync return, torn down before any print call) and is **NOT changed**
- `actionLabel()`, `sessionNameBadge()`, `isTTY()` are **NOT changed**

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| **Modify** | `src/ui/index.ts` | Add `oneShot` helper; make all `print*` functions async; TTY → Ink component; non-TTY → `fallback.ts` |
| **Modify** | `test/ui.test.ts` | Add 6 tests verifying async adapter signatures |
| **Modify** | `src/agent.ts` | `await` at lines 96 and 168 |
| **Modify** | `src/index.ts` | `await` at lines 262, 264, 410, 412 |
| **Modify** | `src/tools/terminal.ts` | `await` all print calls; `handleList()` and `handleRead()` become `async` |
| **Modify** | `src/tools/appendFile.ts` | `await` all print calls |
| **Modify** | `src/tools/githubExtractor.ts` | `await` all print calls |
| **Modify** | `src/tools/listDir.ts` | `await` all print calls |
| **Modify** | `src/tools/listModelfromOpenAI.ts` | `await` all print calls |
| **Modify** | `src/tools/modifyFile.ts` | `await` all print calls |
| **Modify** | `src/tools/readFile.ts` | `await` all print calls |
| **Modify** | `src/tools/runCommand.ts` | `await` all print calls |
| **Modify** | `src/tools/searchFiles.ts` | `await` all print calls |
| **Modify** | `src/tools/webSearch.ts` | `await` all print calls |
| **Modify** | `src/tools/writeFile.ts` | `await` all print calls |
| **Modify** | `src/commands/help.ts` | `await printHelp()` at line 15 |
| **Modify** | `src/commands/history.ts` | `await printSeparator()` at lines 23 and 35 |
| **Modify** | `src/commands/status.ts` | `await printStatus(...)` at line 19 |

---

## Task 1: oneShot helper + async print functions in ui/index.ts

**Files:**
- Modify: `src/ui/index.ts` (complete rewrite of the print functions section)
- Modify: `test/ui.test.ts` (add 6 new async-adapter tests)

**Interfaces produced** (all `print*` change from `void` to `Promise<void>`):
```typescript
export async function printHelp(): Promise<void>
export async function printStatus(opts: { messageCount: number; maxSteps: number; showRaw: boolean; kbFile?: string; model: string; contextLimit: number; sessionName?: string }): Promise<void>
export async function printStepHeader(step: number, maxSteps: number): Promise<void>
export async function printSeparator(): Promise<void>
export async function promptPrintSeperator(sessionName?: string): Promise<void>
export async function printToolHeader(toolName: string, detail: string): Promise<void>
export async function printToolSuccess(message: string): Promise<void>
export async function printToolError(message: string): Promise<void>
export async function printToolBlocked(message: string): Promise<void>
export async function printRejected(): Promise<void>
export async function printContextBar(promptTokens: number, contextLimit: number, threshold?: number): Promise<void>
export async function printDimOutput(lines: string[], maxLines?: number): Promise<void>
```

- [ ] **Step 1: Write 6 failing tests in `test/ui.test.ts`**

Add the following block INSIDE `runUiTests()`, immediately after the existing `ThinkingSpinner` tests (after the `eq('ThinkingSpinner renders non-empty output', ...)` line, before the closing `console.log` and `return`):

```typescript
  // ── ui/index.ts — async adapter signatures ───────────────────────────────
  // Print functions must return Promise<void>. Tests run in non-TTY (no real
  // stdout), so the non-TTY chalk path fires synchronously inside the async
  // wrapper — each call still returns a Promise.
  const uiAdapter = await import('../src/ui/index.js');

  const r1 = uiAdapter.printSeparator();
  eq('printSeparator returns Promise', r1 instanceof Promise, true);
  await r1;

  const r2 = uiAdapter.printStepHeader(2, 5);
  eq('printStepHeader returns Promise', r2 instanceof Promise, true);
  await r2;

  const r3 = uiAdapter.printToolHeader('read_file', 'src/index.ts');
  eq('printToolHeader returns Promise', r3 instanceof Promise, true);
  await r3;

  const r4 = uiAdapter.printToolSuccess('Done.');
  eq('printToolSuccess returns Promise', r4 instanceof Promise, true);
  await r4;

  const r5 = uiAdapter.printContextBar(5000, 100000);
  eq('printContextBar returns Promise', r5 instanceof Promise, true);
  await r5;

  const r6 = uiAdapter.printContextBar(0, 100000);
  eq('printContextBar(0 tokens) resolves without error', r6 instanceof Promise, true);
  await r6;
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:ui
```

Expected: 6 new failures — `printSeparator() instanceof Promise` → `false` (currently returns `void`).

- [ ] **Step 3: Implement the complete new `src/ui/index.ts`**

Replace the entire file with:

```typescript
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';

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

import * as fb from './fallback.js';

export { actionLabel, sessionNameBadge } from './helpers.js';

const isTTY = () => process.stdout.isTTY === true;

// ── One-shot Ink render ───────────────────────────────────────────────────────
// Mounts the component to stdout, awaits the flush, then unmounts.
// Produces one permanent scrolling row. Callers await before calling the next
// one — concurrent renders for the same stdout never occur in practice.
async function oneShot(element: React.ReactElement): Promise<void> {
  const { waitUntilRenderFlush, unmount } = render(element, { exitOnCtrlC: false });
  await waitUntilRenderFlush();
  unmount();
}

// ── Animated startup banner (Ink; runs once, fully awaited) ──────────────────
export async function printBanner(): Promise<void> {
  if (!isTTY()) return fb.printBanner();
  process.stdout.write('\x1Bc'); // clear screen
  const { waitUntilExit } = render(React.createElement(Banner), { exitOnCtrlC: false });
  await waitUntilExit();
}

// ── Transient "Thinking…" spinner (sync; torn down before any print call) ────
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

// ── One-shot print functions ──────────────────────────────────────────────────

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
```

- [ ] **Step 4: Run tests to verify the 6 new tests pass**

```bash
pnpm test:ui
```

Expected: all 6 new tests pass. The prior 34 tests must also still pass. Total = 40 for the UI suite.

- [ ] **Step 5: Type-check and build**

```bash
pnpm build
```

Expected: 0 errors, clean `dist/`.

Note: At this point callers (`agent.ts`, `index.ts`, tools, commands) are NOT yet updated — they call async functions without `await`. TypeScript does not error on missing `await` for `Promise<void>` by default (it's a lint concern, not a type error), so the build passes. Task 2 and 3 correct this.

- [ ] **Step 6: Commit**

```bash
git add src/ui/index.ts test/ui.test.ts
git commit -m "feat(ui): Phase 3 — async oneShot Ink render for all print functions"
```

---

## Task 2: Update agent.ts and index.ts call sites

**Files:**
- Modify: `src/agent.ts` — 2 `await` additions
- Modify: `src/index.ts` — 4 `await` additions

**Consumes:** Task 1's async `print*` signatures.

- [ ] **Step 1: Update `src/agent.ts` — 2 lines**

Line 96 (inside the `while` loop, `if (steps > 1)` block):
```typescript
// Before:
      printStepHeader(steps, options.maxSteps);
// After:
      await printStepHeader(steps, options.maxSteps);
```

Line 168 (after computing `currentContextTokens`):
```typescript
// Before:
    printContextBar(currentContextTokens, getContextLimit(), CONTEXT_GUARD_THRESHOLD);
// After:
    await printContextBar(currentContextTokens, getContextLimit(), CONTEXT_GUARD_THRESHOLD);
```

- [ ] **Step 2: Update `src/index.ts` — 4 lines**

Locate the two `printSeparator()` calls (lines ~262–264) that appear at startup after the banner. They are in the `main()` async function:
```typescript
// Before:
  printSeparator();
  // ...
  printSeparator();
// After:
  await printSeparator();
  // ...
  await printSeparator();
```

Locate the two `promptPrintSeperator` calls in the REPL loop (lines ~410–412):
```typescript
// Before:
      promptPrintSeperator(sessionName);
      userInput = await askMultiline(...);
      promptPrintSeperator();
// After:
      await promptPrintSeperator(sessionName);
      userInput = await askMultiline(...);
      await promptPrintSeperator();
```

- [ ] **Step 3: Build and test**

```bash
pnpm build && pnpm test
```

Expected: 0 type errors, all 240 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/agent.ts src/index.ts
git commit -m "feat(agent,index): await async print functions from Phase 3 ui/index.ts"
```

---

## Task 3: Update all tool file call sites

**Files:** 11 tool files — every `execute()` function and its helpers are already async, so adding `await` is the only change needed.

**Special case — `src/tools/terminal.ts`:** `handleList()` and `handleRead()` are currently synchronous functions (`function handleList(): ToolResult`). They call `printToolHeader` and `printSeparator`. After Task 1 those calls return `Promise<void>`. These two handlers must become `async function`.

- [ ] **Step 1: Update `src/tools/terminal.ts` — async handlers + await**

Change `handleList` signature:
```typescript
// Before:
function handleList(): ToolResult {
// After:
async function handleList(): Promise<ToolResult> {
```

Change `handleRead` signature:
```typescript
// Before:
function handleRead(input: { action: 'read'; name?: string; lines?: number }): ToolResult {
// After:
async function handleRead(input: { action: 'read'; name?: string; lines?: number }): Promise<ToolResult> {
```

Then add `await` before every `print*` call in the entire file. The complete list (current line numbers):

```
line  91:  printToolHeader('terminal:create', name)       → await printToolHeader(...)
line  96:  printRejected()                                 → await printRejected()
line  97:  printSeparator()                                → await printSeparator()
line 104:  printToolSuccess(...)                           → await printToolSuccess(...)
line 105:  printSeparator()                                → await printSeparator()
line 112:  printToolError(msg)                             → await printToolError(msg)
line 113:  printSeparator()                                → await printSeparator()
line 119:  printToolHeader('terminal:list', '')            → await printToolHeader(...)
line 124:  printSeparator()                                → await printSeparator()
line 140:  printSeparator()                                → await printSeparator()
line 153:  printToolHeader('terminal:read', ...)           → await printToolHeader(...)
line 162:  printSeparator()                                → await printSeparator()
line 166:  printToolError(msg)                             → await printToolError(msg)
line 167:  printSeparator()                                → await printSeparator()
line 176:  printToolHeader('terminal:write', ...)          → await printToolHeader(...)
line 181:  printRejected()                                 → await printRejected()
line 182:  printSeparator()                                → await printSeparator()
line 188:  printToolSuccess(...)                           → await printToolSuccess(...)
line 189:  printSeparator()                                → await printSeparator()
line 193:  printToolError(msg)                             → await printToolError(msg)
line 194:  printSeparator()                                → await printSeparator()
line 205:  printToolHeader('terminal:start', ...)          → await printToolHeader(...)
line 210:  printToolBlocked(safety.reason!)                → await printToolBlocked(...)
line 211:  printSeparator()                                → await printSeparator()
line 216:  printRejected()                                 → await printRejected()
line 217:  printSeparator()                                → await printSeparator()
line 224:  printSeparator()                                → await printSeparator()
line 231:  printToolError(msg)                             → await printToolError(msg)
line 232:  printSeparator()                                → await printSeparator()
line 241:  printToolHeader('terminal:wait', ...)           → await printToolHeader(...)
line 251:  printToolError(...)                             → await printToolError(...)
line 252:  printSeparator()                                → await printSeparator()
line 260:  printToolSuccess(...)                           → await printToolSuccess(...)
line 261:  printSeparator()                                → await printSeparator()
line 265:  printToolError(msg)                             → await printToolError(msg)
line 266:  printSeparator()                                → await printSeparator()
line 277:  printToolHeader('terminal:kill', ...)           → await printToolHeader(...)
line 281:  printRejected()                                 → await printRejected()
line 282:  printSeparator()                                → await printSeparator()
line 288:  printToolSuccess(...)                           → await printToolSuccess(...)
line 289:  printSeparator()                                → await printSeparator()
line 293:  printToolError(msg)                             → await printToolError(msg)
line 294:  printSeparator()                                → await printSeparator()
```

- [ ] **Step 2: Update the remaining 10 tool files**

The pattern is identical in every file: add `await` before every call to a `print*` function. Run this command to find every occurrence across all remaining tool files:

```bash
grep -n "print\(ToolHeader\|ToolSuccess\|ToolError\|ToolBlocked\|Rejected\|Separator\|DimOutput\|StepHeader\|ContextBar\|Status\|Help\)" \
  src/tools/appendFile.ts \
  src/tools/githubExtractor.ts \
  src/tools/listDir.ts \
  src/tools/listModelfromOpenAI.ts \
  src/tools/modifyFile.ts \
  src/tools/readFile.ts \
  src/tools/runCommand.ts \
  src/tools/searchFiles.ts \
  src/tools/webSearch.ts \
  src/tools/writeFile.ts
```

For every matching line, prepend `await ` to the function call. All matching lines are inside `async execute()` functions, so no function signature changes are required (unlike `terminal.ts`).

Known call sites by file (from static analysis — use the grep output above to confirm line numbers):

**`src/tools/appendFile.ts`** — lines 40, 44, 45, 50, 55, 56, 62, 63, 67, 68

**`src/tools/githubExtractor.ts`** — lines 143, 146, 158, 165, 205, 206, 214, 227, 230, 240, 246, 247, 268, 269, 277

**`src/tools/listDir.ts`** — lines 38, 41, 42, 52, 55, 56, 60, 61

**`src/tools/listModelfromOpenAI.ts`** — lines 83, 108, 110, 111, 116, 117

**`src/tools/modifyFile.ts`** — lines 45, 49, 50, 58, 59, 64, 65, 79, 80, 92, 93, 97, 98

**`src/tools/readFile.ts`** — lines 40, 44, 45, 50, 51, 65, 71, 72, 84, 85

**`src/tools/runCommand.ts`** — lines 81, 90, 91, 96, 97, 112, 117, 125, 129, 137, 138, 154, 158, 162, 170, 171

**`src/tools/searchFiles.ts`** — lines 40, 43, 44, 58, 63, 68, 69, 77, 78

**`src/tools/webSearch.ts`** — lines 49, 52, 53, 85, 86, 92, 103, 104, 128, 129

**`src/tools/writeFile.ts`** — lines 43, 47, 48, 67, 68, 77, 78, 82, 83

- [ ] **Step 3: Build to catch any missed sites**

```bash
pnpm build
```

TypeScript does not error on unawaited `Promise<void>` calls by default, but if any file has a print call that was accidentally removed or incorrectly typed, the build will catch structural errors. If the build passes, all print calls still produce the correct `void` output through the `fallback.ts` path in tests (non-TTY), so test behavior is unchanged.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all 240 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/terminal.ts src/tools/appendFile.ts src/tools/githubExtractor.ts \
        src/tools/listDir.ts src/tools/listModelfromOpenAI.ts src/tools/modifyFile.ts \
        src/tools/readFile.ts src/tools/runCommand.ts src/tools/searchFiles.ts \
        src/tools/webSearch.ts src/tools/writeFile.ts
git commit -m "feat(tools): await async print functions from Phase 3 ui/index.ts"
```

---

## Task 4: Update command file call sites

**Files:**
- Modify: `src/commands/help.ts` — 1 `await` addition (line 15)
- Modify: `src/commands/history.ts` — 2 `await` additions (lines 23, 35)
- Modify: `src/commands/status.ts` — 1 `await` addition (line 19)

All command `execute()` functions return `Promise<CommandAction>`, so they are already async — `await` additions are trivial.

- [ ] **Step 1: Update `src/commands/help.ts`**

```typescript
// Before (line 15):
        printHelp();
// After:
        await printHelp();
```

- [ ] **Step 2: Update `src/commands/history.ts`**

```typescript
// Before (lines 23 and 35):
      printSeparator();
// After (both occurrences):
      await printSeparator();
```

- [ ] **Step 3: Update `src/commands/status.ts`**

```typescript
// Before (line 19):
       printStatus({
// After:
       await printStatus({
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm test
```

Expected: all 240 tests pass.

- [ ] **Step 5: Build**

```bash
pnpm build
```

Expected: 0 errors, clean `dist/`.

- [ ] **Step 6: Final commit**

```bash
git add src/commands/help.ts src/commands/history.ts src/commands/status.ts
git commit -m "feat(commands): await async print functions from Phase 3 ui/index.ts"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| All `print*` in `ui/index.ts` async | Task 1 |
| TTY path uses Ink `oneShot` | Task 1 |
| Non-TTY path stays chalk (`fallback.ts` unchanged) | Task 1 — `if (!isTTY()) return fb.*` guard |
| All callers add `await` | Tasks 2, 3, 4 |
| `printBanner` unchanged | Task 1 — kept verbatim |
| `startSpinner` unchanged | Task 1 — kept verbatim |
| `fallback.ts` unchanged | Global Constraints — not in File Map |
| No new components | No component files in File Map |
| `pnpm test` passes (240 tests) | Verified at end of each task |
| `pnpm build` clean | Verified at end of each task |

**`terminal.ts` special case:** `handleList()` and `handleRead()` become `async` — this is the only signature change in tools. The dispatcher (`execute()`) already returns `Promise<ToolResult>` and the `switch` cases `return handleList()` / `return handleRead(input)` — returning an async function's promise from an async function is a no-op change, TypeScript accepts this without modification to the dispatcher.

**`listModelfromOpenAI.ts` note:** This file is not a registered tool (it is a startup helper called by `fetchAvailableModelOptions()` via `src/index.ts`). Its print calls still need `await` because they're called in an async context — missing `await` would still complete correctly (the promise resolves), but would allow the next line to execute before the Ink render is flushed to stdout on TTY.

**Non-TTY tests:** The test suite runs in non-TTY (no real stdout), so every async function takes the `if (!isTTY()) return fb.*` branch. These branches return synchronously from inside an `async` function — they still resolve as `Promise<void>`, which is what the 6 new tests verify.
