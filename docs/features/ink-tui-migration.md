# Ink TUI Migration

> Replaces CLIC's static `chalk` + `console.log` UI with a **React component system built on Ink** — the same terminal renderer used by Claude Code. All UI output is now composable, testable, and async; interactive pickers are keyboard-native. `ora` and `@clack/prompts` are removed.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Render model](#render-model)
  - [File structure](#file-structure)
  - [Component inventory](#component-inventory)
  - [Public API](#public-api)
  - [Data types](#data-types)
- [Phase breakdown](#phase-breakdown)
- [Non-TTY fallback](#non-tty-fallback)
- [Callers: what changed](#callers-what-changed)
- [Configuration and flags](#configuration-and-flags)
- [Edge cases](#edge-cases)
- [Test coverage](#test-coverage)
- [Related documents](#related-documents)

---

## Overview

Before this migration, `src/ui.ts` was 417 lines of imperative `console.log` + chalk calls. A line printed to the terminal could never be updated. This prevented live-updating context bars, native animated spinners, and clean interactive pickers.

The migration introduces a component system under `src/ui/` and keeps the existing public API (`printXxx` function signatures) identical through the transition, so callers required zero changes in Phase 1. It proceeded in four phases — each phase shipped working, runnable code.

**What was removed:**
- `src/ui.ts` — replaced by `src/ui/` directory
- `ora` — replaced by `<ThinkingSpinner />` via `ink-spinner`
- `@clack/prompts` — replaced by `<SelectPicker />`, `<ConfirmDialog />`, `<TextPrompt />`

**What was kept:**
- All chalk-based helper functions (moved to `src/ui/fallback.ts`)
- The full color palette (purple/cyan gradient, session badge colors, action icons)
- All existing `printXxx` function signatures, now returning `Promise<void>`

---

## Architecture

### Render model

The UI uses two render patterns, both implemented in `src/ui/index.ts`:

#### `oneShot(element)` — scrolling log output

Every static print function (`printHelp`, `printToolHeader`, `printContextBar`, etc.) goes through `oneShot`:

```
call printXxx(...)
  → enqueue on _renderQueue (promise mutex)
  → prev render settles
  → render(element)           Ink mounts the component
  → waitUntilRenderFlush()    one permanent row flushed to stdout
  → unmount()                 Ink tears down the component
  → next render dequeued
```

The `_renderQueue` mutex is the key implementation detail: when tools run in parallel (`Promise.all`), all of them call `oneShot` simultaneously. Without the mutex, multiple `render()` calls hit the same stdout before any `unmount()`, causing Ink's "reusing stdout" error. The mutex chains each call so renders execute one-at-a-time.

```typescript
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
```

#### `interactive(factory)` — keyboard input

Interactive prompts (`selectPrompt`, `confirmPrompt`, `textPrompt`) go through `interactive`, which chains through the same `_renderQueue` so a picker never races a scrolling render:

```
call selectPrompt(opts)
  → enqueue on _renderQueue
  → render(factory(onResolve))    Ink mounts the picker
  → user navigates / presses Enter
  → onResolve(value) called       caller's Promise resolves
  → instance.clear() + unmount()  picker erased from terminal
```

#### Banner — special case

`printBanner()` bypasses `oneShot` and calls `render()` + `waitUntilExit()` directly. The `<Banner>` component drives its own animation via `setInterval` + `useEffect`, then calls `exit()` from `useApp()` when the animation completes. This is the only component that keeps a live render region open for multiple frames.

#### Spinner — transient live region

`startSpinner()` mounts `<ThinkingSpinner>` outside the queue. It is only active while the LLM is thinking (nothing else writes to stdout during that window), and torn down by `stop()` the instant the first token arrives. `stop()` is idempotent.

---

### File structure

```
src/ui/
├── index.ts                # Public API: oneShot, interactive, all printXxx + prompt functions
├── theme.ts                # Color constants: LOGO_COLORS, SESSION_PALETTE, ACTION_STYLES, W
├── helpers.ts              # Pure functions: visLen, logoGradient, boxTop/Bottom/Div/Line,
│                           #   sessionPaletteEntry, actionLabel, sessionNameBadge,
│                           #   CANCEL, SelectItem, selectInitialIndex
├── fallback.ts             # Chalk-based implementations of all printXxx — used on non-TTY
└── components/
    ├── Banner.tsx           # Animated gradient logo + tagline + tools panel
    ├── ContextBar.tsx       # Token progress bar: green / yellow / red by fill %
    ├── ConfirmDialog.tsx    # y/N keyboard dialog
    ├── DimOutput.tsx        # Dimmed tool output with line-count truncation
    ├── Help.tsx             # 2-column capabilities / commands reference panel
    ├── SelectPicker.tsx     # Arrow-key selection picker
    ├── Separator.tsx        # Horizontal rule + session-colored prompt divider
    ├── Spinner.tsx          # ThinkingSpinner via ink-spinner (transient)
    ├── Status.tsx           # System context panel
    ├── StepHeader.tsx       # "Step N / M" badge
    ├── TextPrompt.tsx       # Single-line text input with mask, placeholder, validation
    ├── ToolHeader.tsx       # Tool-use box: tool name + detail line
    └── ToolResult.tsx       # success / error / blocked / rejected result lines
```

---

### Component inventory

#### Static components (one-shot via `oneShot`)

| Component | Props | Replaces |
|---|---|---|
| `<Banner />` | `instantMode?: boolean` | `printBanner()` |
| `<Help />` | none | `printHelp()` |
| `<Status />` | `messageCount`, `maxSteps`, `showRaw`, `kbFile`, `model`, `contextLimit`, `sessionName` | `printStatus(opts)` |
| `<StepHeader />` | `step: number`, `maxSteps: number` | `printStepHeader()` |
| `<ContextBar />` | `promptTokens`, `contextLimit`, `threshold?` | `printContextBar()` |
| `<ToolHeader />` | `toolName: string`, `detail: string` | `printToolHeader()` |
| `<ToolResult />` | `type: 'success'\|'error'\|'blocked'\|'rejected'`, `message?: string` | `printToolSuccess/Error/Blocked/Rejected()` |
| `<Separator />` | none | `printSeparator()` |
| `<PromptSeparator />` | `sessionName?: string` | `promptPrintSeperator()` |
| `<DimOutput />` | `lines: string[]`, `maxLines?: number` | `printDimOutput()` |

`<Banner>` is special: it runs its own animation loop and calls `useApp().exit()` on completion; the adapter uses `waitUntilExit()` instead of `waitUntilRenderFlush()`.

#### Transient component

| Component | Lifecycle | Replaces |
|---|---|---|
| `<ThinkingSpinner />` | Mounted by `startSpinner()`, torn down by `stop()` on first token | `ora.start()` / `ora.stop()` |

#### Interactive components (via `interactive`)

| Component | Props | Replaces |
|---|---|---|
| `<SelectPicker<T> />` | `message`, `items: SelectItem<T>[]`, `initialValue?`, `onSelect`, `onCancel` | `@clack/prompts select()` |
| `<ConfirmDialog />` | `message`, `detail?`, `onConfirm: (accepted: boolean) => void` | `confirm()` in tools + `@clack/prompts confirm()` |
| `<TextPrompt />` | `message`, `placeholder?`, `mask?`, `validate?`, `onSubmit`, `onCancel` | `@clack/prompts text()` |

---

### Public API

All functions are exported from `src/ui/index.ts`. Callers import from `'../ui/index.js'` (unchanged import path).

**Print functions** (all `async`, return `Promise<void>`):

```typescript
printBanner(): Promise<void>
printHelp(): Promise<void>
printStatus(opts: { messageCount, maxSteps, showRaw, kbFile?, model, contextLimit, sessionName? }): Promise<void>
printStepHeader(step: number, maxSteps: number): Promise<void>
printSeparator(): Promise<void>
promptPrintSeperator(sessionName?: string): Promise<void>
printToolHeader(toolName: string, detail: string): Promise<void>
printToolSuccess(message: string): Promise<void>
printToolError(message: string): Promise<void>
printToolBlocked(message: string): Promise<void>
printRejected(): Promise<void>
printContextBar(promptTokens: number, contextLimit: number, threshold?: number): Promise<void>
printDimOutput(lines: string[], maxLines?: number): Promise<void>
```

**Spinner** (synchronous, fire-and-forget):

```typescript
startSpinner(): { stop: () => void }
```

**Interactive prompts** (all `async`):

```typescript
selectPrompt<T>(opts: { message: string; items: SelectItem<T>[]; initialValue?: T }): Promise<T | typeof CANCEL>
textPrompt(opts: { message: string; placeholder?: string; mask?: string; validate?: (v: string) => string | undefined }): Promise<string | typeof CANCEL>
confirmPrompt(opts: { message: string; detail?: string }): Promise<boolean>
```

**Re-exported helpers**:

```typescript
actionLabel(action: string): string
sessionNameBadge(name: string): string
CANCEL: unique symbol         // returned by selectPrompt / textPrompt on Esc / Ctrl+C
SelectItem<T>                 // { label: string; value: T; hint?: string }
```

---

### Data types

#### `SelectItem<T>`

```typescript
interface SelectItem<T = string> {
  label: string;   // displayed text
  value: T;        // resolved on selection
  hint?: string;   // dim text shown after label
}
```

#### `CANCEL` symbol

A `unique symbol` exported from `src/ui/helpers.ts`. Returned by `selectPrompt` and `textPrompt` when the user presses Esc or Ctrl+C. Callers check with `=== CANCEL` — replaces `@clack/prompts`' `isCancel()` function.

```typescript
const result = await selectPrompt({ message: 'Pick a model', items });
if (result === CANCEL) return; // user cancelled
```

---

## Phase breakdown

### Phase 1 — Static component system

**Commits shipped:** `feat(ui): Phase 1 — migrate chalk UI to Ink React component system`  
**39 files, +3044 / -156**

Created the entire `src/ui/` directory. Moved all chalk logic to `src/ui/fallback.ts` (renamed from `src/ui.ts`). Extracted color constants to `theme.ts`, pure helpers to `helpers.ts`. Built all static components (`Banner`, `Help`, `Status`, `ToolHeader`, `ToolResult`, `Separator`, `DimOutput`, `StepHeader`, `ContextBar`). Adapter shims in `index.ts` expose the same `printXxx` function signatures — zero changes required in any caller.

Build changes:
- `tsconfig.json`: added `"jsx": "react-jsx"` under `compilerOptions`
- `tsup.config.ts`: created with `jsx: true` for JSX transpilation

UI test suite created from scratch: `test/ui.test.ts` (200 lines of tests).

---

### Phase 2 — Animated spinner; render mutex; drop ora

**Commits shipped:** `feat(ui): Phase 2 — animated spinner, streaming, per-step context bar; drop ora`  
**10 files, +1129 / -163**

Added `<ThinkingSpinner />` (`src/ui/components/Spinner.tsx`) backed by `ink-spinner`, and the `startSpinner()` adapter in `index.ts`. Removed `ora` from `agent.ts`, `commands/compact.ts`, `commands/model.ts`, and `index.ts`. Added the `_renderQueue` promise mutex to `oneShot()` to prevent concurrent render collisions when tools run in parallel. Fixed a long-standing context bar bug: `printContextBar` is now called once per step with the current prompt token count (not the cumulative sum across all steps), aligning the 80% auto-compact guard with what is displayed.

Dependencies changed: `ora` removed; `ink-spinner` added.

10 new tests in `test/ui.test.ts`.

---

### Phase 3 — Async print calls across all tools and commands

**Commits shipped:** `feat(ui): Phase 3 — async oneShot renders, parallel-safe render mutex`  
**20 files, +863 / -200**

All `printXxx` functions were already returning `Promise<void>` since Phase 1, but callers were calling them fire-and-forget (not awaiting). Phase 3 propagated `await` to every call site — all 10 tool modules and affected command files — so the render mutex actually serialises concurrent renders correctly. Without awaiting, tools running in parallel would all enter `oneShot` simultaneously and race past `await prev`.

Files updated to `await` their render calls:
- `src/tools/readFile.ts`, `writeFile.ts`, `appendFile.ts`, `modifyFile.ts`
- `src/tools/listDir.ts`, `runCommand.ts`, `searchFiles.ts`
- `src/tools/webSearch.ts`, `githubExtractor.ts`, `terminal.ts`
- `src/tools/listModelfromOpenAI.ts`
- `src/agent.ts`, `src/index.ts`
- `src/commands/help.ts`, `history.ts`, `status.ts`
- `src/config.ts`

30 new tests in `test/ui.test.ts` covering async render correctness and mutex serialisation.

---

### Phase 4 — Interactive pickers replace @clack/prompts

**Commits shipped:** `feat(ui): Phase 4 — replace @clack/prompts with Ink interactive components`  
**16 files, +1507 / -116  |  UI tests: 66 → 74**

Built three new interactive components (`SelectPicker`, `ConfirmDialog`, `TextPrompt`) and the `interactive()` function in `index.ts`. Exported `selectPrompt`, `confirmPrompt`, `textPrompt`, `CANCEL`, and `SelectItem`. Replaced every `@clack/prompts` call site:

| File | Old | New |
|---|---|---|
| `src/index.ts` | `@clack/prompts select()` × 2 (model, role startup pickers) | `selectPrompt()` |
| `src/commands/model.ts` | `@clack/prompts select()` | `selectPrompt()` |
| `src/commands/role.ts` | `@clack/prompts select()` | `selectPrompt()` |
| `src/commands/privacy.ts` | `@clack/prompts select()` | `selectPrompt()` |
| `src/commands/session.ts` | `@clack/prompts select()` | `selectPrompt()` |
| `src/commands/export.ts` | `@clack/prompts select()` | `selectPrompt()` |

`@clack/prompts` removed from `package.json`. 8 new tests.

---

## Non-TTY fallback

Ink requires a real TTY. All functions check `process.stdout.isTTY === true` before routing to Ink; on a non-TTY they call the equivalent chalk function from `src/ui/fallback.ts` instead.

| Scenario | `isTTY` | Path |
|---|---|---|
| Interactive terminal | `true` | Ink components via `oneShot` / `interactive` |
| `--paste` mode (piped stdin) | `false` | `fallback.ts` chalk functions |
| CI / redirected stdout | `false` | `fallback.ts` chalk functions |

The check is per-call in `index.ts` — no global flag, no changes needed in callers. The `interactive` functions (`selectPrompt`, `textPrompt`) return `CANCEL` on non-TTY (no picker can be shown). `confirmPrompt` returns `false`.

---

## Callers: what changed

### Phase 1 — zero changes

All `printXxx` signatures were preserved. Callers did not need updating.

### Phase 2 — `startSpinner()` replaces `ora`

Any code that called `ora.start()` / `ora.stop()` now calls `startSpinner()`:

```typescript
// before
const spinner = ora('Thinking...').start();
// ... LLM streams ...
spinner.stop();

// after
const spinner = startSpinner();
// ... LLM streams ...
spinner.stop();
```

### Phase 3 — `await` all print calls

All `printXxx` calls must be awaited for the render mutex to work correctly:

```typescript
// before (fire-and-forget — broken under parallel tools)
printToolHeader(name, detail);

// after
await printToolHeader(name, detail);
```

### Phase 4 — `selectPrompt` / `confirmPrompt` / `textPrompt` replace `@clack/prompts`

```typescript
// before
import { select, isCancel } from '@clack/prompts';
const result = await select({ message: 'Pick a model', options: items });
if (isCancel(result)) return;

// after
import { selectPrompt, CANCEL } from './ui/index.js';
const result = await selectPrompt({ message: 'Pick a model', items });
if (result === CANCEL) return;
```

---

## Configuration and flags

| Flag | Effect |
|---|---|
| `--yolo` | `<ConfirmDialog />` is not rendered — `confirmPrompt` resolves `true` immediately without mounting |
| `--paste` | Forces non-TTY path; all Ink rendering bypassed, chalk fallback used |
| `--no-terminals` | Orthogonal — only affects `run_command` routing |
| `--no-watch` | Orthogonal — watcher flag |
| `--no-history` | Orthogonal — privacy flag |

The `--yolo` shortcut for `confirmPrompt` lives in each call site (callers pass `yolo` and skip `confirmPrompt` entirely), matching the semantics of the old `confirm()` callback.

---

## Edge cases

**Parallel tool execution:** the `_renderQueue` mutex ensures renders are serialised even when `Promise.all` fires multiple tools simultaneously. Each `oneShot` call enqueues behind the previous and awaits its turn before calling `render()`.

**Spinner and oneShot coexistence:** `startSpinner()` mounts `<ThinkingSpinner>` outside the queue, but it is only ever alive while the LLM is in the "thinking" phase — no tool output is being printed at that point. The spinner is torn down by `stop()` before the first `printXxx` call from the streaming response.

**`CANCEL` on non-TTY:** `selectPrompt` returns `CANCEL` when not on a TTY. Callers that check `=== CANCEL` and bail out will skip the operation cleanly. This is intentional — there is no way to present an interactive picker in a non-TTY session.

**`instantMode` on `<Banner />`:** the `Banner` component accepts an `instantMode?: boolean` prop that skips the `setInterval` animation and jumps to the fully-rendered state immediately. This is used in tests to avoid real-time delays.

**Wide / narrow terminals:** `<Banner />`, `<ContextBar />`, `<StepHeader />` all read `process.stdout.columns` for width calculations, same as the old chalk implementation.

---

## Test coverage

| Phase | Tests added | Notes |
|---|---|---|
| Phase 1 | 200 | First UI test suite; covers all static components |
| Phase 2 | 10 | Spinner lifecycle; context bar token counting |
| Phase 3 | 30 | Async render correctness; mutex serialisation |
| Phase 4 | 8 | `SelectPicker`, `ConfirmDialog`, `TextPrompt`; `CANCEL` symbol |

All tests in `test/ui.test.ts`. The `<Banner instantMode />` prop is used by tests to render the banner synchronously without animation delays.

---

## Related documents

- [ADR-011 — Ink as TUI Renderer](../adr/ADR-011-ink-tui-migration.md) — Decision record: why Ink, why Bottom-Up migration, all four decisions with options and rationale
- [`.private/pr-detail.md`](../../.private/pr-detail.md) — PR description with per-phase commit breakdown and acceptance criteria
- [Design Spec](../../superpowers/specs/2026-10-26-ink-tui-migration-design.md) — Original phase-by-phase implementation spec
