# Ink TUI Migration

> Migrates CLIC's terminal UI from a static `chalk` + `console.log` rendering model to a fully reactive, component-based system built on **Ink** (React for terminals) — the same foundation used by Claude Code — enabling live-updating panels, animated spinners, and a full REPL experience with an anchored input line.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Files involved](#files-involved)
  - [Component inventory](#component-inventory)
  - [Phase structure](#phase-structure)
  - [Data flow](#data-flow)
- [New dependencies](#new-dependencies)
- [What changes for callers](#what-changes-for-callers)
- [Non-TTY fallback](#non-tty-fallback)
- [Configuration & flags](#configuration--flags)
- [Edge cases & safety](#edge-cases--safety)
- [Related decisions](#related-decisions)

---

## Overview

CLIC's original UI (`src/ui.ts`) prints static lines downward using `chalk` + `console.log`. This cannot produce live updates — a context bar, streaming text, or animated spinner requires reprinting entire sections or relying on `ora`'s cursor tricks. The result is visually limited compared to Claude Code's reactive panels.

This migration introduces **Ink** — a React renderer for the terminal — and restructures all UI rendering into composable React components under `src/ui/`. The migration proceeds in four phases so the app remains fully functional after each phase:

1. **Static components** — banner, help, tool headers rendered via Ink one-shot `render()` + `unmount()`
2. **Reactive components** — streaming output, animated spinner, live context bar driven by React state
3. **Full REPL app** — `readline` replaced by a persistent Ink `<ReplApp>` with `<TextInput />`
4. **Interactive pickers** — `@clack/prompts` replaced by Ink-native `<SelectPicker />` and `<ConfirmDialog />`

---

## Architecture

### Files involved

| File | Role |
|---|---|
| `src/ui/index.ts` | Public API — re-exports all components and printXxx adapter shims |
| `src/ui/theme.ts` | Color constants, gradient palette (`LOGO_COLORS`), box-drawing helpers, session palette |
| `src/ui/helpers.ts` | `visLen()`, `sessionPaletteEntry()`, `actionLabel()` — pure helpers extracted from original `ui.ts` |
| `src/ui/fallback.ts` | Chalk-based fallback implementations for non-TTY environments |
| `src/ui/components/Banner.tsx` | Animated gradient logo + tagline + info badges + tools panel |
| `src/ui/components/Help.tsx` | 2-column capabilities / commands reference panel |
| `src/ui/components/Status.tsx` | System context panel (OS, user, model, session, history stats) |
| `src/ui/components/ToolHeader.tsx` | Tool-use box: tool name + detail line |
| `src/ui/components/ToolResult.tsx` | Success / error / blocked / rejected result lines |
| `src/ui/components/Separator.tsx` | Horizontal rule + session-colored prompt divider |
| `src/ui/components/DimOutput.tsx` | Dimmed tool output with line-count truncation |
| `src/ui/components/TurnPanel.tsx` | Phase 2 reactive hub — mounts during agent turn, contains StepHeader + Spinner + StreamingOutput + ContextBar |
| `src/ui/components/StepHeader.tsx` | "Step N / M" badge rendered at each agent step |
| `src/ui/components/ContextBar.tsx` | Live token progress bar — green / yellow / red by fill % |
| `src/ui/components/StreamingOutput.tsx` | LLM streaming text — updates on each token event |
| `src/ui/components/Spinner.tsx` | Animated spinner via `ink-spinner` |
| `src/ui/components/ReplApp.tsx` | Persistent full-session REPL app — output history + active turn + input |
| `src/ui/components/SelectPicker.tsx` | Arrow-key selection picker (model, role, privacy) |
| `src/ui/components/ConfirmDialog.tsx` | y/n keyboard confirmation dialog |
| `src/agent.ts` | Gains `TurnEmitter` parameter — emits `token`, `tool`, `tokens`, `done` events |
| `src/index.ts` | Phase 3: REPL loop becomes event-driven; Phase 4: startup pickers use `<SelectPicker />` |

### Component inventory

#### Phase 1 — Static (one-shot render + unmount)

| Component | Props | Replaces |
|---|---|---|
| `<Banner />` | none | `printBanner()` |
| `<Help />` | none | `printHelp()` |
| `<Status />` | `messageCount`, `maxSteps`, `showRaw`, `kbFile`, `model`, `contextLimit`, `sessionName` | `printStatus(opts)` |
| `<ToolHeader />` | `toolName: string`, `detail: string` | `printToolHeader()` |
| `<ToolResult />` | `type: 'success'\|'error'\|'blocked'\|'rejected'`, `message?: string` | `printToolSuccess/Error/Blocked/Rejected()` |
| `<Separator />` | none | `printSeparator()` |
| `<PromptSeparator />` | `sessionName?: string` | `promptPrintSeperator()` |
| `<DimOutput />` | `lines: string[]`, `maxLines?: number` | `printDimOutput()` |

#### Phase 2 — Reactive (persistent during agent turn)

| Component | State source | What it does |
|---|---|---|
| `<TurnPanel />` | `TurnEmitter` | Container — mounts all reactive sub-components |
| `<StepHeader />` | `step` state from `'tool'` event | Shows current step number |
| `<Spinner />` | unmounts on `'done'` event | Animates while LLM is streaming |
| `<StreamingOutput />` | `text` state from `'token'` events | Appends each LLM chunk in place |
| `<ContextBar />` | `TokenUsage` from `'tokens'` event | Live token progress bar, updates without reprint |

#### Phase 3 — REPL App (persistent for session lifetime)

| Component | Role |
|---|---|
| `<ReplApp />` | Root app — owns session state |
| `<OutputHistory />` | Scrollable list of completed turn outputs |
| `<ActiveTurn />` | Phase 2 `<TurnPanel />` mounted during active agent run |
| `<PromptSeparator />` | Session-colored divider line above input |
| `<TextInput />` | User input line — captures text, handles multiline, submits on Enter |

#### Phase 4 — Interactive Pickers

| Component | Props | Replaces |
|---|---|---|
| `<SelectPicker />` | `items[]`, `title`, `onSelect` | `@clack/prompts select()` |
| `<ConfirmDialog />` | `message`, `detail?`, `onConfirm` | `confirm()` in tools + `@clack/prompts confirm()` |

### Phase structure

```
Phase 1 (Week 1)          Phase 2 (Week 2)          Phase 3 (Week 3)          Phase 4 (Week 4)
─────────────────         ─────────────────         ─────────────────         ─────────────────
src/ui/ created           TurnEmitter added          ReplApp mounted           SelectPicker live
Static components         to agent.ts               readline removed          ConfirmDialog live
Adapter shims             TurnPanel reactive         TextInput owns stdin      @clack/prompts out
src/ui.ts deleted         ora removed               Full Ink REPL             ora fully gone
Callers unchanged         Context bar live          Multiline in Ink
```

### Data flow

#### Before (chalk)

```
Agent turn starts
  → printStepHeader()          console.log static line
  → ora.start()                cursor-trick spinner
  → LLM streams chunk          process.stdout.write(chunk)  static output
  → printContextBar()          console.log static line after turn
  → ora.stop()
```

#### After (Ink)

```
Agent turn starts
  → mount <TurnPanel emitter={emitter} />   Ink takes over render area
  → emitter.emit('tool', name)              → <StepHeader /> re-renders in place
  → LLM streams chunk                       → emitter.emit('token', chunk)
                                            → <StreamingOutput /> state += chunk
                                            → <Spinner /> animates concurrently
  → turn ends                               → emitter.emit('tokens', usage)
                                            → <ContextBar /> updates fill in place
                                            → emitter.emit('done')
  → unmount <TurnPanel />                   output becomes static, scrolls up
```

---

## New dependencies

| Package | Version | Removes |
|---|---|---|
| `ink` | `^5.x` | — |
| `react` | `^18.x` | — |
| `ink-spinner` | `^5.x` | `ora` |
| `ink-text-input` | `^6.x` | `readline` (Phase 3) |
| `ink-select-input` | `^3.x` | `@clack/prompts` (Phase 4) |

`chalk` remains. `ora` is removed after Phase 2. `@clack/prompts` is removed after Phase 4.

---

## What changes for callers

### Phase 1 — nothing

`src/ui/index.ts` exports all the same `printXxx` function signatures. Zero changes to `index.ts`, `agent.ts`, or any command.

### Phase 2 — one new parameter

`runAgentTurn()` in `src/agent.ts` gains an optional `emitter?: TurnEmitter`. `index.ts` creates the emitter and passes it in. If `emitter` is absent, behavior is unchanged (non-TTY path).

### Phase 3 — REPL loop rewritten

`src/index.ts`'s `main()` REPL loop replaces the `readline.question` / `ask()` pattern with a `<ReplApp onSubmit={runTurn} />` component. The `ask()` and `askMultiline()` helpers are deleted.

### Phase 4 — picker call sites updated

Each `@clack/prompts select()` call in `index.ts` is replaced with a `renderPicker()` helper that mounts `<SelectPicker />`, awaits selection, and unmounts. The `confirm()` callback in `src/tools/types.ts` is updated to mount `<ConfirmDialog />` and resolve on keypress.

---

## Non-TTY Fallback

Ink requires a real TTY. CLIC runs in non-interactive mode in several cases:

| Scenario | Detection | Behavior |
|---|---|---|
| `--paste` mode | `opts.paste === true` | Skip Ink, use `src/ui/fallback.ts` chalk functions |
| Piped stdin | `process.stdin.isTTY === false` | Skip Ink, use fallback |
| CI / no TTY | `process.stdout.isTTY === false` | Skip Ink, use fallback |

`src/ui/index.ts` checks TTY at call time and routes to fallback automatically — no changes needed in callers.

---

## Configuration & flags

| Flag | Effect on Ink UI |
|---|---|
| `--no-terminals` | Orthogonal — only affects `run_command` routing; Ink UI unaffected |
| `--no-watch` | Orthogonal — watcher disable; Ink UI unaffected |
| `--paste` | Forces non-TTY fallback path; no Ink rendering |
| `--yolo` | `<ConfirmDialog />` auto-resolves `true` without rendering; same semantics as before |
| `--no-history` | Orthogonal — privacy flag; Ink UI unaffected |

---

## Edge cases & safety

**Ink + node-pty coexistence:** `<ReplApp />` owns stdin. node-pty PTY shells write to their own pseudo-terminals, not `process.stdin` — no conflict. The `terminal` tool's PTY output is piped back as a string result, displayed via `<StreamingOutput />` or `<DimOutput />`.

**SIGINT during agent turn:** Ink's `useApp().exit()` is called on SIGINT. The `AbortController` signal passed to `runAgentTurn()` is aborted first, cancelling the in-flight LLM stream, then the Ink app exits cleanly. Same behavior as today.

**Crash during Ink render:** An unhandled exception inside a component triggers React's error boundary. A top-level `<ErrorBoundary>` in `<ReplApp />` catches render errors, falls back to `process.stdout.write` for the error message, and exits — no silent crash.

**Very wide terminals:** All box-drawing uses `process.stdout.columns` for width calculation, same as today. Ink's `<Box>` layout respects terminal width natively.

**Windows terminals:** Ink supports Windows Terminal and PowerShell. Legacy `cmd.exe` lacks Unicode support for box-drawing characters — same limitation as the current chalk implementation.

---

## Related decisions

- [ADR-011](../adr/ADR-011-ink-tui-migration.md) — Decision record: why Ink over Blessed/Enhanced Chalk, why Bottom-Up incremental migration, why Full Ink input over readline hybrid
- [Design Spec](../superpowers/specs/2026-10-26-ink-tui-migration-design.md) — Full phase-by-phase implementation spec
- [`src/ui.ts`](../../src/ui.ts) — Original chalk-based UI (replaced by this feature)
- [`src/agent.ts`](../../src/agent.ts) — Phase 2: gains `TurnEmitter` parameter
- [`src/index.ts`](../../src/index.ts) — Phase 3: REPL loop rewritten around `<ReplApp />`
