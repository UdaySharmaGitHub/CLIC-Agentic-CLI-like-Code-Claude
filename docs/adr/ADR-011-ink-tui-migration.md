# ADR-011: Ink as TUI Renderer (Migration from Chalk)

**Date:** 2026-10-26  
**Status:** Accepted  
**Completed:** 2026-10-30  
**Deciders:** Uday Sharma

---

## Context

CLIC's terminal UI (`src/ui.ts`) is built entirely on `chalk` + `console.log`. Every render is a static line printed downward — once printed, it cannot be updated in place. This makes it impossible to:

- Animate a spinner natively while the LLM streams (without `ora`'s cursor-position workaround)
- Update a context-fill bar in real time as tokens accumulate during a turn
- Keep the user's input line anchored at the bottom while output scrolls above it
- Match the reactive, "alive" panel aesthetic of tools like Claude Code

The project needs a rendering foundation that supports reactive, component-based terminal output — while preserving the existing color palette, box-drawing style, and overall visual identity.

Four decisions were made: **what UI capability to target**, **which library to adopt**, **how to migrate**, and **how to handle user input**.

---

## Decision 1 — UI Improvement Target: Dynamic/Reactive Panels

### Options considered

**A) Dynamic/reactive panels** — things that update *in place* as the agent runs: a live status bar at the bottom, tool steps that animate, streaming output that overwrites previous content. Requires a full rendering engine that owns the terminal screen area.

**B) Better visual style** — same static rendering as today, but cleaner boxes, richer gradients, more polish. Achievable with lightweight additions on top of the existing chalk foundation (e.g. `gradient-string`). No reactive capability added.

**C) Interactive components** — richer prompts, menus, confirmation dialogs with keyboard navigation (arrow keys, checkboxes). Achievable with `@clack/prompts` enhancements. No live-updating panels.

### Chosen: A — Dynamic/reactive panels

### Why

Option A is the only choice that closes the gap between CLIC and Claude Code's feel. The spinner-while-streaming, live context bar, and tool-step animation are the specific interactions that make Claude Code feel like a production-grade tool. Options B and C improve polish or prompts but leave the core rendering model static — every improvement hits a ceiling that only a reactive engine can break through. Option A also subsumes B and C: once Ink is in place, better visual style and interactive pickers come for free as composable components.

---

## Decision 2 — Library: Ink

### Options considered

**Option 1 — Ink** (React for the terminal, by Vadim Demedes)  
React component model renders to the terminal via yoga-layout. Used by Claude Code, GitHub Copilot CLI, Vercel CLI. Supports TypeScript natively. Rich ecosystem: `ink-spinner`, `ink-text-input`, `ink-select-input`. Actively maintained.

**Option 2 — Blessed / Neo-Blessed**  
ncurses-style full-screen widget library for Node.js. Provides boxes, tables, forms, scrollable regions. Familiar to anyone who has written ncurses-style TUIs. Last meaningful release 2019; TypeScript types are community-contributed and incomplete.

**Option 3 — Enhanced Chalk** (`gradient-string` + `@clack/prompts` + `ora`)  
Stay on chalk. Add `gradient-string` for richer color gradients, keep `@clack/prompts` for interactive pickers, keep `ora` for spinners. Minimal migration cost.

**Option 4 — Terminal-Kit**  
Full-featured terminal control library with cursor positioning, drawing primitives, and form widgets. More control than chalk, less opinionated than Ink.

**Option 5 — Bubble Tea** (Go, Elm architecture for terminals)  
Not applicable — CLIC is Node.js/TypeScript. No maintained Node.js port exists.

### Chosen: Option 1 — Ink

### Why

Claude Code is built on Ink — it is the proven path to the exact aesthetic CLIC targets. Ink's React component model is the only option in this list that makes reactive rendering (Decision 1-A) trivial: components re-render when state changes, with no manual cursor management. Options 2 and 4 require imperative cursor-position code that is fragile across terminal emulators. Option 3 is statically limited and cannot fulfil Decision 1-A at all. Option 5 does not apply.

---

## Decision 3 — Migration Strategy: Bottom-Up Incremental (4 Phases)

### Options considered

**Approach 1 — Bottom-Up Incremental** (Static → Reactive → Full REPL → Pickers)  
Migrate in four ordered phases. Each phase ships working code. Phase 1 converts all static renders to Ink components with adapter shims so callers change nothing. Subsequent phases add reactive capability, full REPL, then pickers.

**Approach 2 — Core-First** (REPL first, then panels)  
Start with the hardest phase (replacing readline with a full Ink REPL app), then retrofit static panels and pickers into it. Gets to the "alive" feeling fastest but the highest-risk phase comes first.

**Approach 3 — Parallel Build** (feature flag `--ink`)  
Build the entire Ink UI in `src/ui-ink/` alongside the existing chalk code. Run both behind a flag. Cut over once the new UI is complete and tested. The working app is never disturbed during development.

### Chosen: Approach 1 — Bottom-Up Incremental

### Why

Approach 1 is the only strategy where every intermediate state is a shippable, fully-functional version of CLIC. Phase 1 is purely additive — adapter shims mean zero caller changes — making it the lowest-risk entry point. Bugs from each phase are bounded: a Phase 2 regression only affects the `<TurnPanel>` rendering, not the REPL loop. Approach 2 front-loads the riskiest change (readline removal), which would block all review if a bug appears. Approach 3 requires maintaining two full UI systems in parallel for 4 weeks; the chalk code continues to diverge during that period, increasing the merge cost at cutover. Bottom-up is safer, independently reviewable, and matches the single-maintainer context of this project.

---

## Decision 4 — Input Handling: Ink for Interactive Pickers, readline Retained for REPL

### Options considered

**Option A — Full Ink input**  
Replace `readline` entirely with Ink's `<TextInput />` component (`ink-text-input`). Ink owns stdin for the lifetime of the session. History and multiline input handled by Ink's `useInput` hook.

**Option B — Ink for interactive pickers + renders, keep readline for REPL**  
Use one-shot Ink mounts (via a `_renderQueue` mutex) for interactive surfaces (model/role pickers, API-key prompt, confirmations). The REPL prompt line stays readline-based. Ink mounts, resolves a value, unmounts — exactly how `@clack/prompts` behaved. readline and Ink never own stdin simultaneously.

### Chosen: Option B — Ink for interactive pickers, readline retained for REPL

### Why

The original plan targeted Option A (full readline replacement) but implementation revealed it was not necessary to achieve the stated goal. The actual driver was removing `@clack/prompts` and gaining reactive panels — not replacing the REPL input line itself. Option B fulfils both goals without the high risk of a readline-to-TextInput swap:

- Every interactive surface (7 selects, 2 text inputs, 1 password, 2 confirms) is now an Ink component with a consistent `CANCEL` sentinel, indistinguishable to the user from Option A.
- The readline REPL is unaffected — multiline input, tab completion, and `/` commands continue working exactly as before.
- The one-shot mount pattern (`interactive<T>()` chained through `_renderQueue`) guarantees Ink and readline never own stdin at the same time, eliminating the cursor-conflict risk that made Option B unworkable in earlier analysis.

Option A remains possible as a future Phase 5 if the anchored-input-line UX is ever prioritised, with no rework required — the Ink component layer is already in place.

---

## Rationale Summary

| Decision | Options | Chosen | Key reason |
|---|---|---|---|
| UI target | A) Reactive · B) Visual style · C) Interactive | **A — Reactive panels** | Only option that matches Claude Code's "alive" feel; subsumes B and C |
| Library | Ink · Blessed · Enhanced Chalk · Terminal-Kit | **Ink** | Claude Code uses it; only option with reactive rendering + active TypeScript ecosystem |
| Migration | Bottom-Up · Core-First · Parallel Build | **Bottom-Up Incremental** | Every phase ships working code; bugs are bounded; safest for single-maintainer |
| Input | Full Ink (`<TextInput />`) · Ink pickers + readline REPL | **Ink pickers + readline REPL** | Removes `@clack/prompts` without readline-replacement risk; one-shot mount pattern eliminates stdin conflict |

---

## Alternatives Considered

### Why not Blessed / Neo-Blessed

Maintenance is effectively stalled (last meaningful release 2019). TypeScript support is community-contributed and incomplete. The widget model targets full-screen static layouts (like `htop`), not the streaming-text-with-input-line pattern CLIC needs. The resulting aesthetic would not match Claude Code.

### Why not Enhanced Chalk

Still fundamentally static — cannot update a line in place after it is printed. The reactive context bar and animated streaming output are impossible without terminal cursor-position hacks that break on many terminal emulators. This approach reaches a hard ceiling within one or two features.

### Why not Terminal-Kit

Imperative API with no React analogue. Requires manual cursor management for dynamic updates. No ecosystem of reusable components. The productivity gap vs. Ink is significant for what CLIC needs.

### Why not All-at-once migration

High risk — a regression in Phase 3 (the REPL loop) blocks all review. Impossible to test incrementally. Any Ink-specific bug affects the entire app simultaneously.

### Why not Parallel Build

Requires maintaining two full UI implementations for 4 weeks. The chalk code continues to diverge (new features, bug fixes) during that period, increasing merge complexity. Acceptable for a team; overkill for a single-maintainer project.

### Why not Readline hybrid input

The original Option B analysis concluded that `Static` mode cannot anchor an input line at the bottom. This remains true for a persistent `<TextInput />`-based REPL. However, the one-shot mount pattern (`interactive<T>()`) sidesteps the problem entirely: Ink mounts only for the duration of a picker or prompt, then unmounts before readline takes over. The conflict risk is structural only when both systems are persistent and concurrent — which they are not in the shipped implementation.

---

## Consequences

**Positive:**
- Live-updating context bar, streaming output, and animated spinner are straightforward React state — shipped in Phases 2–3.
- `src/ui.ts` (417-line imperative file) replaced by ~15 small, composable, independently testable components under `src/ui/components/`.
- `ora` removed (Phase 2) and `@clack/prompts` removed (Phase 4) — the project now has a single rendering system (Ink + chalk) instead of three competing ones.
- Phase 4 added three custom Ink components (`SelectPicker`, `TextPrompt`, `ConfirmDialog`) covering all 7 select, 2 text, 1 password, and 2 confirm interactive surfaces with a consistent `CANCEL` sentinel.
- Opens the door to future UX features: scrollable output history, inline diff rendering, side-by-side layouts — all difficult or impossible with chalk.

**Negative:**
- React and JSX are added to the build pipeline. `tsconfig.json` needs `"jsx": "react-jsx"`. `tsup` config needs JSX transpilation. This adds ~1 MB to `node_modules`.
- Non-TTY environments (`--paste`, piped input, CI) cannot use Ink. A chalk-based fallback (`src/ui/fallback.ts`) must be maintained in parallel indefinitely.
- Ink components must be `.tsx` files. The project gains a JSX dependency it did not previously have, which may surprise contributors expecting a pure `.ts` codebase.
- If Ink releases a breaking major version, the migration cost falls on CLIC. Currently mitigated by Ink's stable API history (v4→v5 was additive).

---

## References

- [Ink GitHub](https://github.com/vadimdemedes/ink)
- [Feature doc: Ink TUI Migration](../features/ink-tui-migration.md)
- [Design spec](../superpowers/specs/2026-10-26-ink-tui-migration-design.md)
- [`src/ui/`](../../src/ui/) — Ink component system (replaced `src/ui.ts`)
- [`src/index.ts`](../../src/index.ts) — REPL loop + startup wizard
- [`src/agent.ts`](../../src/agent.ts) — streaming output (Phase 2 TurnEmitter)
