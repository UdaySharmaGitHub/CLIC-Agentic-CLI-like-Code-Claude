# Design Spec: Ink TUI Migration

**Date:** 2026-10-26  
**Status:** Approved  
**Author:** Uday Sharma

---

## Problem Statement

CLIC's current terminal UI (`src/ui.ts`) is built on `chalk` + `console.log` — every render is a static, imperative line printed downward. This makes it impossible to:

- Update a status bar in place as tokens stream
- Animate spinners natively without the `ora` workaround
- Keep an input line anchored at the bottom while output scrolls above
- Produce the "alive" reactive panels that define Claude Code's UX

The goal is to migrate to **Ink** (React for terminals) — the same foundation Claude Code is built on — so CLIC's UI becomes fully reactive, composable, and production-grade.

---

## Goals

- Replace `src/ui.ts` with a React component system under `src/ui/`
- Preserve the existing color palette, gradients, and box-drawing aesthetic exactly
- Enable live-updating panels: streaming output, animated spinner, reactive context bar
- Replace `readline` with Ink `<TextInput />` for a full Claude Code-style REPL experience
- Replace `@clack/prompts` with Ink-native pickers and confirmation dialogs
- Keep every existing caller (`index.ts`, `agent.ts`, `commands/`) unchanged through Phase 1 via adapter shims

## Non-Goals

- Changing any agent logic, tool behavior, or slash command behavior
- Adding new visual features beyond matching the current aesthetic
- Supporting non-TTY environments (piped output, `--paste` mode stays chalk-based)

---

## Architecture

### Directory structure

```
src/ui/
├── index.ts                  # re-exports all components + printXxx adapter shims
├── theme.ts                  # color constants, gradient palette, box-drawing helpers
├── helpers.ts                # visLen(), sessionPaletteEntry(), actionLabel()
└── components/
    ├── Banner.tsx             # Phase 1 — animated logo + tagline
    ├── Help.tsx               # Phase 1 — 2-column capabilities/commands panel
    ├── Status.tsx             # Phase 1 — system context panel
    ├── ToolHeader.tsx         # Phase 1 — tool-use box (name + detail)
    ├── ToolResult.tsx         # Phase 1 — success / error / blocked / rejected
    ├── Separator.tsx          # Phase 1 — horizontal rule + prompt divider
    ├── DimOutput.tsx          # Phase 1 — dimmed tool output lines
    ├── TurnPanel.tsx          # Phase 2 — reactive hub, mounts/unmounts per agent turn
    ├── StepHeader.tsx         # Phase 2 — "Step N / M" badge
    ├── ContextBar.tsx         # Phase 2 — live token progress bar (reactive state)
    ├── StreamingOutput.tsx    # Phase 2 — LLM streaming text (reactive state)
    ├── Spinner.tsx            # Phase 2 — animated spinner via ink-spinner
    ├── ReplApp.tsx            # Phase 3 — persistent full-REPL Ink app
    ├── SelectPicker.tsx       # Phase 4 — model / role / privacy picker
    └── ConfirmDialog.tsx      # Phase 4 — y/n confirmation dialog
```

### New dependencies

| Package | Replaces | Purpose |
|---|---|---|
| `ink` | — | React-to-terminal renderer (core) |
| `react` | — | Required peer dependency for Ink |
| `ink-spinner` | `ora` | Native animated terminal spinner |
| `ink-text-input` | `readline` | REPL text input component (Phase 3) |
| `ink-select-input` | `@clack/prompts` | Arrow-key selection picker (Phase 4) |

`chalk` **stays** — Ink `<Text>` components accept chalk-colored strings.  
`ora` is removed after Phase 2. `@clack/prompts` is removed after Phase 4.

### Adapter shim pattern (Phase 1 — zero-disruption migration)

`src/ui/index.ts` re-exports wrapper functions with the same signatures as the original `src/ui.ts`. Each wrapper calls Ink's `render()`, waits for the component to finish, then calls `unmount()` — producing static output that scrolls up, identical to today's behavior.

```typescript
// src/ui/index.ts
import { render } from 'ink';
import { Banner } from './components/Banner.js';

export async function printBanner(): Promise<void> {
  const { unmount } = render(<Banner />);
  await new Promise(r => setTimeout(r, 800)); // match current animation timing
  unmount();
}
```

No caller changes required. `src/ui.ts` is deleted; `src/ui/index.ts` takes its place.

---

## Phase 1 — Static Components

**Timeline:** Week 1  
**Risk:** Low — behavior-identical to current output  
**Callers changed:** None (adapter shims maintain API)

### Component inventory

| Component | Replaces | Key props |
|---|---|---|
| `<Banner />` | `printBanner()` | none — reads from `theme.ts` |
| `<Help />` | `printHelp()` | none |
| `<Status />` | `printStatus(opts)` | `messageCount`, `maxSteps`, `showRaw`, `kbFile`, `model`, `contextLimit`, `sessionName` |
| `<ToolHeader />` | `printToolHeader(name, detail)` | `toolName: string`, `detail: string` |
| `<ToolResult />` | `printToolSuccess/Error/Blocked/Rejected` | `type: 'success'\|'error'\|'blocked'\|'rejected'`, `message?: string` |
| `<Separator />` | `printSeparator()` | none |
| `<PromptSeparator />` | `promptPrintSeperator(sessionName?)` | `sessionName?: string` |
| `<DimOutput />` | `printDimOutput(lines, maxLines?)` | `lines: string[]`, `maxLines?: number` |

### Theme continuity

All constants extracted from the current `src/ui.ts` into `src/ui/theme.ts`:

```typescript
export const accent      = chalk.hex('#60E1F0');
export const accentBold  = chalk.hex('#60E1F0').bold;
export const LOGO_COLORS = ['#C084FC','#A78BFA','#818CF8','#60A5FA','#38BDF8','#22D3EE'];
export const W           = 62; // inner content width
export const SESSION_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#7C3AED', fg: '#FFFFFF' }, // violet
  { bg: '#DC2626', fg: '#FFFFFF' }, // red
  { bg: '#059669', fg: '#FFFFFF' }, // emerald
  { bg: '#2563EB', fg: '#FFFFFF' }, // blue
  { bg: '#D97706', fg: '#000000' }, // amber
  { bg: '#0891B2', fg: '#FFFFFF' }, // cyan
  { bg: '#DB2777', fg: '#FFFFFF' }, // pink
  { bg: '#65A30D', fg: '#FFFFFF' }, // lime
  { bg: '#EA580C', fg: '#FFFFFF' }, // orange
  { bg: '#0D9488', fg: '#FFFFFF' }, // teal
];
```

---

## Phase 2 — Reactive/Dynamic Components

**Timeline:** Week 2  
**Risk:** Medium — requires event bridge between agent loop and Ink state  
**Callers changed:** `src/agent.ts` (emit events), `src/index.ts` (mount/unmount `<TurnPanel>`)

### Event bridge design

`src/agent.ts` receives an optional `TurnEmitter` (a typed `EventEmitter`). During a turn it emits:

```typescript
emitter.emit('token',   chunk: string)      // LLM stream chunk
emitter.emit('tool',    name: string)        // tool call started
emitter.emit('tokens',  usage: TokenUsage)   // turn complete, final usage
emitter.emit('done')                         // tear down panel
```

`index.ts` creates the emitter, mounts `<TurnPanel emitter={emitter} contextLimit={n} />`, runs the agent, then unmounts.

### `<TurnPanel>` — the reactive hub

```
<TurnPanel>
  ├── <StepHeader step={n} maxSteps={m} />   re-renders on each 'tool' event
  ├── <Spinner />                             animates until 'done'
  ├── <StreamingOutput text={text} />        appends on each 'token' event
  └── <ContextBar tokens={n} limit={m} />    updates on 'tokens' event
</TurnPanel>
```

`ora` is removed — `ink-spinner` handles animation inside Ink's render loop natively.

### `<ContextBar />` live behavior

- Green `█` fill when < 60% context used
- Yellow fill 60–80%
- Red fill > 80% (auto-compact threshold)
- Updates without reprinting — Ink re-renders only the changed component

---

## Phase 3 — Full REPL App

**Timeline:** Week 3  
**Risk:** High — replaces the `readline`-based REPL loop entirely  
**Callers changed:** `src/index.ts` (REPL loop rewritten as event-driven Ink app)

### Persistent `<ReplApp>`

A single Ink app instance that lives for the entire session:

```tsx
<ReplApp>
  <OutputHistory messages={history} />   // scrollable past turns
  <ActiveTurn emitter={emitter} />       // Phase 2 panel, wired in
  <PromptSeparator session={name} />     // colored session divider
  <TextInput
    value={input}
    onChange={setInput}
    onSubmit={handleSubmit}
    placeholder="Ask anything..."
  />
</ReplApp>
```

`handleSubmit(value)` → pushes to history, mounts `<ActiveTurn>`, runs agent, unmounts `<ActiveTurn>`, appends result to history.

### readline removal

`readline` is used in three places today:
1. `ask()` / `askMultiline()` in `src/index.ts` — replaced by `<TextInput />`
2. `slashCompleter()` tab-completion — replaced by Ink `useInput` handler
3. `readline.createInterface` keepalive — replaced by Ink's own stdin ownership

### Multiline input

The existing `askMultiline()` logic (line ending `\` or unclosed triple-backtick triggers accumulation) is preserved inside `<TextInput />` as a `useInput` state machine.

---

## Phase 4 — Interactive Pickers

**Timeline:** Week 4  
**Risk:** Low — isolated to picker surfaces  
**Callers changed:** `src/index.ts` (startup pickers), `src/commands/` (confirm dialog)

### Picker replacements

| Current | Replacement | Used by |
|---|---|---|
| `@clack/prompts select` (model) | `<SelectPicker />` | `src/index.ts` startup |
| `@clack/prompts select` (role) | `<SelectPicker />` | `src/index.ts` startup |
| `@clack/prompts select` (privacy) | `<SelectPicker />` | `src/commands/privacy.ts` |
| `confirm()` in tools | `<ConfirmDialog />` | `src/tools/` (all destructive ops) |

### `<SelectPicker />` props

```typescript
interface SelectPickerProps {
  items: Array<{ label: string; value: string; description?: string }>;
  title: string;
  onSelect: (value: string) => void;
}
```

### `<ConfirmDialog />` props

```typescript
interface ConfirmDialogProps {
  message: string;
  detail?: string;
  onConfirm: (accepted: boolean) => void;
}
```

After Phase 4 complete: `@clack/prompts` removed from `package.json`.

---

## Data Flow Changes Summary

| | Before (chalk) | After (Ink) |
|---|---|---|
| Banner render | `console.log` lines with delays | `render(<Banner />)` then `unmount()` |
| LLM streaming | `process.stdout.write(chunk)` | `emitter.emit('token', chunk)` → React state |
| Spinner | `ora.start()` / `ora.stop()` | `<Spinner />` inside persistent `<TurnPanel>` |
| Context bar | `printContextBar()` after turn | `<ContextBar />` live-updates during turn |
| User input | `readline.question()` | `<TextInput onSubmit={fn} />` |
| Model picker | `@clack/prompts select()` | `<SelectPicker onSelect={fn} />` |
| Confirm dialog | `@clack/prompts confirm()` | `<ConfirmDialog onConfirm={fn} />` |

---

## Non-TTY / `--paste` Mode

Ink requires a TTY. For piped/non-interactive usage (`--paste`, `cat file | pnpm dev --paste`, CI):
- Detect `process.stdout.isTTY === false`
- Fall back to the existing chalk-based `printXxx` functions (kept in `src/ui/fallback.ts`)
- No Ink rendering occurs in non-TTY mode

---

## Testing Strategy

| Phase | How to test |
|---|---|
| Phase 1 | Visual diff: run `pnpm dev` before and after, compare banner/help/tool header output |
| Phase 2 | Run a multi-step agent task, verify spinner animates and context bar updates live |
| Phase 3 | Interactive REPL session: multiline input, tab complete, slash commands, Ctrl+C |
| Phase 4 | Model picker, role picker, tool confirmation — all keyboard paths |

Unit tests: Ink components can be tested with `ink-testing-library` — assert rendered text content without a real TTY.

---

## Migration Checklist

- [ ] Phase 1: `src/ui/theme.ts`, `src/ui/helpers.ts`, all static components, adapter shims, delete `src/ui.ts`
- [ ] Phase 2: `TurnEmitter` type, `<TurnPanel>` + sub-components, wire into `src/agent.ts` and `src/index.ts`, remove `ora`
- [ ] Phase 3: `<ReplApp>`, `<TextInput>`, event-driven REPL loop, remove `readline`
- [ ] Phase 4: `<SelectPicker>`, `<ConfirmDialog>`, wire all picker sites, remove `@clack/prompts`
- [ ] Non-TTY fallback: `src/ui/fallback.ts`, TTY detection in `src/ui/index.ts`
- [ ] Update `tsconfig.json` for JSX (`"jsx": "react-jsx"`)
- [ ] Update `tsup` config for JSX transpilation
- [ ] `pnpm add ink react ink-spinner ink-text-input ink-select-input`
- [ ] `pnpm add -D @types/react`
- [ ] `pnpm remove @clack/prompts` (after Phase 4 — `ora` already removed in Phase 2)

---

## References

- [Ink GitHub](https://github.com/vadimdemedes/ink) — React for CLI apps
- [`src/ui.ts`](../../src/ui.ts) — current chalk-based UI (to be replaced)
- [`src/index.ts`](../../src/index.ts) — REPL loop (Phase 3 target)
- [`src/agent.ts`](../../src/agent.ts) — streaming output (Phase 2 target)
