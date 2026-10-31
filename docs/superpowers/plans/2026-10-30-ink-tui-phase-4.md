# Ink TUI Phase 4 — Interactive Pickers & Full @clack Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every `@clack/prompts` interactive surface (7 selects, 2 text inputs, 1 confirm, the API-key password, intro/outro) and the readline-based tool confirm with three Ink components, then remove `@clack/prompts` from the project.

**Architecture:** Three new Ink components built on `useInput` + `Text`/`Box` primitives (`<SelectPicker>`, `<TextPrompt>`, `<ConfirmDialog>`) live in `src/ui/components/`. A new `interactive<T>()` adapter in `src/ui/index.ts` — the interactive analogue of Phase 3's `oneShot` — mounts a component, resolves a value from user input, clears + unmounts, and chains through the existing `_renderQueue` mutex. Three exported async wrappers (`selectPrompt`, `textPrompt`, `confirmPrompt`) expose a TTY→Ink / non-TTY→deterministic-fallback contract, mirroring every call site's current `@clack` usage. A module-level `CANCEL` sentinel replaces `isCancel`.

**Tech Stack:** Ink 8, React 19 (already installed), TypeScript ESM NodeNext, `jsx: react-jsx`. No new runtime dependencies; `@clack/prompts` is removed.

## Global Constraints

- ESM project — every local import uses the `.js` extension even when the source is `.ts`/`.tsx`.
- NEVER run `git commit`. Standing project rule: the user reviews and commits manually. Each task ends by staging files and pausing for review — do not commit.
- `pnpm typecheck` (`tsc --noEmit`) must report 0 errors before each task's review checkpoint.
- `pnpm test` (all suites) must pass before each checkpoint — baseline is **240 tests** (UI suite **66**). This plan adds **8** UI tests → **248 total**.
- `src/ui/fallback.ts` is NOT modified — it remains the non-TTY chalk implementation for the `print*` functions and is unrelated to interactive prompts.
- No new npm packages are added. The only dependency change is `pnpm remove @clack/prompts` (Task 9).
- Interactive components are built ONLY on Ink primitives (`Box`, `Text`, `useInput`) — do not add `ink-select-input` or `ink-text-input`.
- Every interactive surface is a one-shot mount: it takes raw-mode stdin, resolves on select/submit/cancel, then clears + unmounts. It must never be mounted while the REPL's `readline` interface is open (it never is — `ask()` closes its interface in `finally` before any command/confirm runs).
- Non-TTY contract (Ink cannot raw-mode a pipe): `selectPrompt` → `initialValue` if set else first item's value; `confirmPrompt` → `false`; `textPrompt` → `CANCEL`. Call sites handle these exactly where they handle `isCancel` today.
- Preserve the current confirm semantics: only `y`/`Y` accepts; `n`/`N`/Enter/Esc/Ctrl+C reject.
- Interactive TTY paths (arrow-key selection, typing, masking, y/n) CANNOT be unit-tested without a TTY — Ink's `useInput` throws when raw mode is unsupported. Automated tests cover the pure helpers and the non-TTY adapter contract; TTY paths are verified manually by running `pnpm dev`.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| **Modify** | `src/ui/helpers.ts` | Add `CANCEL` sentinel, `SelectItem<T>` type, `selectInitialIndex()` pure helper |
| **Create** | `src/ui/components/SelectPicker.tsx` | Arrow-key list picker with dim hints + `❯` cursor |
| **Create** | `src/ui/components/TextPrompt.tsx` | Single-line text/password input with optional mask + validate |
| **Create** | `src/ui/components/ConfirmDialog.tsx` | y/N confirmation |
| **Modify** | `src/ui/index.ts` | Add `interactive<T>()` adapter + `selectPrompt`/`textPrompt`/`confirmPrompt`; re-export `CANCEL`, `SelectItem` |
| **Modify** | `test/ui.test.ts` | Add 8 tests: pure helpers + non-TTY adapter contract |
| **Modify** | `src/index.ts` | Startup wizard (intro/outro, password, model, role) + REPL/single-turn confirm |
| **Modify** | `src/commands/model.ts` | `select` → `selectPrompt` |
| **Modify** | `src/commands/role.ts` | `select` → `selectPrompt` |
| **Modify** | `src/commands/privacy.ts` | `select` (with `initialValue`) → `selectPrompt` |
| **Modify** | `src/commands/export.ts` | 2× `select` → `selectPrompt` |
| **Modify** | `src/commands/session.ts` | 2× `text` → `textPrompt`, 2× `select` → `selectPrompt`, `confirm` → `confirmPrompt` |
| **Modify** | `package.json` | `pnpm remove @clack/prompts` |

---

## Task 1: Prompt primitives — CANCEL sentinel, SelectItem type, pure helper

**Files:**
- Modify: `src/ui/helpers.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```typescript
  export const CANCEL: unique symbol;            // replaces @clack isCancel
  export interface SelectItem<T = string> { label: string; value: T; hint?: string }
  export function selectInitialIndex<T>(items: SelectItem<T>[], initialValue?: T): number
  ```

- [ ] **Step 1: Write the failing tests**

In `test/ui.test.ts`, inside `runUiTests()`, after the existing `helpers.ts` test block (right after the `boxLine` assertions), add:

```typescript
  // ── Phase 4: CANCEL + selectInitialIndex ──────────────────
  const { CANCEL, selectInitialIndex } = await import('../src/ui/helpers.js');
  eq('CANCEL is a symbol', typeof CANCEL, 'symbol');
  eq('selectInitialIndex finds the initial value', selectInitialIndex([{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], 'b'), 1);
  eq('selectInitialIndex missing value → 0', selectInitialIndex([{ label: 'A', value: 'a' }], 'z'), 0);
  eq('selectInitialIndex no initial → 0', selectInitialIndex([{ label: 'A', value: 'a' }]), 0);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:ui`
Expected: FAIL — `selectInitialIndex` is not exported from `helpers.js` (import yields `undefined`, calls throw or mismatch).

- [ ] **Step 3: Implement the helpers**

Append to `src/ui/helpers.ts`:

```typescript
/** Sentinel returned by interactive prompts when the user cancels (Esc / Ctrl+C). Replaces @clack's isCancel. */
export const CANCEL: unique symbol = Symbol('clic.prompt.cancel');

/** One selectable row for <SelectPicker>. `hint` renders dimmed after the label. */
export interface SelectItem<T = string> {
  label: string;
  value: T;
  hint?: string;
}

/** Index of the item whose value === initialValue, or 0 when absent/not found. */
export function selectInitialIndex<T>(items: SelectItem<T>[], initialValue?: T): number {
  if (initialValue === undefined) return 0;
  const i = items.findIndex(it => it.value === initialValue);
  return i >= 0 ? i : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:ui`
Expected: PASS — UI suite now **70** (66 + 4).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Stage and pause for review (do NOT commit)**

```bash
git add src/ui/helpers.ts test/ui.test.ts
```
Report completion. The user reviews and commits manually.

---

## Task 2: `<SelectPicker>` component + `interactive` adapter + `selectPrompt`

**Files:**
- Create: `src/ui/components/SelectPicker.tsx`
- Modify: `src/ui/index.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Consumes: `CANCEL`, `SelectItem<T>`, `selectInitialIndex` (Task 1); `accent` from `theme.ts`; `render`, `_renderQueue`, `isTTY` (existing in `index.ts`).
- Produces:
  ```typescript
  // src/ui/components/SelectPicker.tsx
  export interface SelectPickerProps<T> { message: string; items: SelectItem<T>[]; initialValue?: T; onSelect: (value: T) => void; onCancel: () => void }
  export function SelectPicker<T>(props: SelectPickerProps<T>): React.ReactElement

  // src/ui/index.ts
  async function interactive<T>(factory: (resolve: (value: T) => void) => React.ReactElement): Promise<T>
  export async function selectPrompt<T = string>(opts: { message: string; items: SelectItem<T>[]; initialValue?: T }): Promise<T | typeof CANCEL>
  export { CANCEL } from './helpers.js'
  export type { SelectItem } from './helpers.js'
  ```

- [ ] **Step 1: Create the SelectPicker component**

Create `src/ui/components/SelectPicker.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { accent } from '../theme.js';
import type { SelectItem } from '../helpers.js';
import { selectInitialIndex } from '../helpers.js';

export interface SelectPickerProps<T> {
  message: string;
  items: SelectItem<T>[];
  initialValue?: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
}

export function SelectPicker<T>({ message, items, initialValue, onSelect, onCancel }: SelectPickerProps<T>) {
  const [index, setIndex] = useState(() => selectInitialIndex(items, initialValue));

  useInput((input, key) => {
    if (key.upArrow) setIndex(i => (i === 0 ? items.length - 1 : i - 1));
    else if (key.downArrow) setIndex(i => (i === items.length - 1 ? 0 : i + 1));
    else if (key.return) onSelect(items[index]!.value);
    else if (key.escape || (key.ctrl && input === 'c')) onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text>{accent('  ? ') + chalk.bold(message)}</Text>
      {items.map((item, i) => {
        const selected = i === index;
        const cursor = selected ? accent('❯') : ' ';
        const label = selected ? accent(item.label) : item.label;
        const hint = item.hint ? chalk.dim(`  ${item.hint}`) : '';
        return <Text key={i}>{`  ${cursor} ${label}${hint}`}</Text>;
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Add the `interactive` adapter + `selectPrompt` to `src/ui/index.ts`**

Add these imports near the other component imports at the top of `src/ui/index.ts`:

```typescript
import { SelectPicker } from './components/SelectPicker.js';
import type { SelectPickerProps } from './components/SelectPicker.js';
import { CANCEL, selectInitialIndex } from './helpers.js';
import type { SelectItem } from './helpers.js';
```

Update the existing re-export line (currently `export { actionLabel, sessionNameBadge } from './helpers.js';`) to also surface the Phase 4 symbols:

```typescript
export { actionLabel, sessionNameBadge, CANCEL } from './helpers.js';
export type { SelectItem } from './helpers.js';
```

Then add the adapter + first wrapper directly below the existing `oneShot` function:

```typescript
// ── Interactive Ink render ─────────────────────────────────────────────────────
// Like oneShot, but resolves a value from user input. Mounts the component, waits
// for it to call resolve() (on select / submit / cancel), then clears + unmounts.
// Chained through the same _renderQueue mutex so it never races a scrolling render.
async function interactive<T>(
  factory: (resolve: (value: T) => void) => React.ReactElement,
): Promise<T> {
  const prev = _renderQueue;
  let release!: () => void;
  _renderQueue = new Promise<void>(r => { release = r; });
  try {
    await prev;
    return await new Promise<T>((resolveValue) => {
      const holder: { instance?: ReturnType<typeof render> } = {};
      const onResolve = (value: T) => {
        holder.instance?.clear();
        holder.instance?.unmount();
        resolveValue(value);
      };
      holder.instance = render(factory(onResolve), { exitOnCtrlC: false });
    });
  } finally {
    release();
  }
}

export async function selectPrompt<T = string>(opts: {
  message: string;
  items: SelectItem<T>[];
  initialValue?: T;
}): Promise<T | typeof CANCEL> {
  if (!isTTY()) {
    const i = selectInitialIndex(opts.items, opts.initialValue);
    return opts.items[i]!.value;
  }
  return interactive<T | typeof CANCEL>((resolve) =>
    React.createElement(SelectPicker as React.FC<SelectPickerProps<T>>, {
      message: opts.message,
      items: opts.items,
      initialValue: opts.initialValue,
      onSelect: (v: T) => resolve(v),
      onCancel: () => resolve(CANCEL),
    }),
  );
}
```

- [ ] **Step 3: Write the failing non-TTY contract tests**

In `test/ui.test.ts`, immediately after the Task 1 block, add (the save/restore of `isTTY` makes the test deterministic whether run piped or in a terminal):

```typescript
  // ── Phase 4: adapter non-TTY contract ─────────────────────
  const uiMod = await import('../src/ui/index.js');
  const savedTTY = process.stdout.isTTY;
  (process.stdout as { isTTY?: boolean }).isTTY = false;
  try {
    eq('selectPrompt non-TTY returns initialValue',
      await uiMod.selectPrompt({ message: 'm', items: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], initialValue: 'b' }), 'b');
    eq('selectPrompt non-TTY returns first item when no initial',
      await uiMod.selectPrompt({ message: 'm', items: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }), 'a');
  } finally {
    (process.stdout as { isTTY?: boolean }).isTTY = savedTTY;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:ui`
Expected: PASS — UI suite now **72** (70 + 2).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Manually verify the live picker**

Run: `pnpm dev`
At the startup model picker (or run `/model` once in the REPL), confirm: arrow keys move the `❯` cursor, hints render dimmed, Enter selects, Esc cancels. This exercises the TTY path the automated tests cannot.

- [ ] **Step 7: Stage and pause for review (do NOT commit)**

```bash
git add src/ui/components/SelectPicker.tsx src/ui/index.ts test/ui.test.ts
```
Report completion. The user reviews and commits manually.

---

## Task 3: `<TextPrompt>` component + `textPrompt` adapter

**Files:**
- Create: `src/ui/components/TextPrompt.tsx`
- Modify: `src/ui/index.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Consumes: `interactive`, `isTTY`, `CANCEL`, `React`, `render` (from Task 2 / existing `index.ts`); `accent` from `theme.ts`.
- Produces:
  ```typescript
  // src/ui/components/TextPrompt.tsx
  export interface TextPromptProps { message: string; placeholder?: string; mask?: string; validate?: (value: string) => string | undefined; onSubmit: (value: string) => void; onCancel: () => void }
  export function TextPrompt(props: TextPromptProps): React.ReactElement

  // src/ui/index.ts
  export async function textPrompt(opts: { message: string; placeholder?: string; mask?: string; validate?: (value: string) => string | undefined }): Promise<string | typeof CANCEL>
  ```

- [ ] **Step 1: Create the TextPrompt component**

Create `src/ui/components/TextPrompt.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { accent } from '../theme.js';

export interface TextPromptProps {
  message: string;
  placeholder?: string;
  mask?: string;
  validate?: (value: string) => string | undefined;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextPrompt({ message, placeholder, mask, validate, onSubmit, onCancel }: TextPromptProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) { onCancel(); return; }
    if (key.return) {
      const err = validate?.(value);
      if (err) { setError(err); return; }
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) { setValue(v => v.slice(0, -1)); setError(undefined); return; }
    if (input && !key.ctrl && !key.meta) { setValue(v => v + input); setError(undefined); }
  });

  const shown = value.length === 0
    ? chalk.dim(placeholder ?? '')
    : (mask ? mask.repeat(value.length) : value);

  return (
    <Box flexDirection="column">
      <Text>{accent('  ? ') + chalk.bold(message) + ' ' + shown + accent('▏')}</Text>
      {error ? <Text>{chalk.red(`    ${error}`)}</Text> : null}
    </Box>
  );
}
```

- [ ] **Step 2: Add `textPrompt` to `src/ui/index.ts`**

Add the import near the other component imports:

```typescript
import { TextPrompt } from './components/TextPrompt.js';
```

Add the wrapper directly below `selectPrompt`:

```typescript
export async function textPrompt(opts: {
  message: string;
  placeholder?: string;
  mask?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string | typeof CANCEL> {
  if (!isTTY()) return CANCEL;
  return interactive<string | typeof CANCEL>((resolve) =>
    React.createElement(TextPrompt, {
      message: opts.message,
      placeholder: opts.placeholder,
      mask: opts.mask,
      validate: opts.validate,
      onSubmit: (v: string) => resolve(v),
      onCancel: () => resolve(CANCEL),
    }),
  );
}
```

- [ ] **Step 3: Write the failing non-TTY contract test**

In `test/ui.test.ts`, inside the existing `try { ... }` block from Task 2 (before the `finally`), add:

```typescript
    eq('textPrompt non-TTY returns CANCEL',
      (await uiMod.textPrompt({ message: 'name' })) === CANCEL, true);
```

Note: `CANCEL` here is the binding imported in the Task 1 test block (`const { CANCEL, ... } = await import('../src/ui/helpers.js')`), which is the same symbol `index.ts` re-exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:ui`
Expected: PASS — UI suite now **73** (72 + 1).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Manually verify the live input**

Run: `pnpm dev -- --session __scratch_verify` then in the REPL run `/session new` — confirm typing appears, Backspace deletes, invalid names show the red validation error, Enter submits, Esc cancels. (Then `/session delete __scratch_verify` to clean up, or ignore — it is a throwaway.)

- [ ] **Step 7: Stage and pause for review (do NOT commit)**

```bash
git add src/ui/components/TextPrompt.tsx src/ui/index.ts test/ui.test.ts
```
Report completion. The user reviews and commits manually.

---

## Task 4: `<ConfirmDialog>` component + `confirmPrompt` adapter

**Files:**
- Create: `src/ui/components/ConfirmDialog.tsx`
- Modify: `src/ui/index.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Consumes: `interactive`, `isTTY`, `React`, `render` (existing); nothing from `helpers.ts`.
- Produces:
  ```typescript
  // src/ui/components/ConfirmDialog.tsx
  export interface ConfirmDialogProps { message: string; detail?: string; onConfirm: (accepted: boolean) => void }
  export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement

  // src/ui/index.ts
  export async function confirmPrompt(opts: { message: string; detail?: string }): Promise<boolean>
  ```

- [ ] **Step 1: Create the ConfirmDialog component**

Create `src/ui/components/ConfirmDialog.tsx`:

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';

export interface ConfirmDialogProps {
  message: string;
  detail?: string;
  onConfirm: (accepted: boolean) => void;
}

export function ConfirmDialog({ message, detail, onConfirm }: ConfirmDialogProps) {
  useInput((input, key) => {
    const ch = input.toLowerCase();
    if (ch === 'y') onConfirm(true);
    else if (ch === 'n' || key.return || key.escape || (key.ctrl && input === 'c')) onConfirm(false);
  });

  return (
    <Box flexDirection="column">
      <Text>{`  ${chalk.yellow('▶')} ${message} ${chalk.dim('(y/N)')}`}</Text>
      {detail ? <Text>{chalk.dim(`    ${detail}`)}</Text> : null}
    </Box>
  );
}
```

- [ ] **Step 2: Add `confirmPrompt` to `src/ui/index.ts`**

Add the import near the other component imports:

```typescript
import { ConfirmDialog } from './components/ConfirmDialog.js';
```

Add the wrapper directly below `textPrompt`:

```typescript
export async function confirmPrompt(opts: {
  message: string;
  detail?: string;
}): Promise<boolean> {
  if (!isTTY()) return false;
  return interactive<boolean>((resolve) =>
    React.createElement(ConfirmDialog, {
      message: opts.message,
      detail: opts.detail,
      onConfirm: (accepted: boolean) => resolve(accepted),
    }),
  );
}
```

- [ ] **Step 3: Write the failing non-TTY contract test**

In `test/ui.test.ts`, inside the same `try { ... }` block (before the `finally`), add:

```typescript
    eq('confirmPrompt non-TTY returns false', await uiMod.confirmPrompt({ message: 'ok?' }), false);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:ui`
Expected: PASS — UI suite now **74** (73 + 1).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: **248 passed** (240 + 8), 0 failed.

- [ ] **Step 7: Stage and pause for review (do NOT commit)**

```bash
git add src/ui/components/ConfirmDialog.tsx src/ui/index.ts test/ui.test.ts
```
Report completion. The user reviews and commits manually.

---

## Task 5: Migrate the startup wizard in `src/index.ts`

Replaces the `@clack` `intro`, `password`, two `select` (model, role), and `outro` used during setup. Confirms stay for Task 6.

**Files:**
- Modify: `src/index.ts` (import line 13; wizard body ~lines 97-207)

**Interfaces:**
- Consumes: `selectPrompt`, `textPrompt`, `CANCEL` (Tasks 2-3). `fetchAvailableModelOptions()` returns `Array<{ value: string; label: string; hint: string }>` — assignable to `SelectItem<string>[]`.
- Produces: no new exports.

- [ ] **Step 1: Update imports**

In `src/index.ts`, delete the `@clack/prompts` import (line 13):

```typescript
import { intro, select, password, isCancel, outro } from '@clack/prompts';
```

Find the existing import from `./ui/index.js` and add `selectPrompt, textPrompt, CANCEL` to it. For example, if it currently reads:

```typescript
import { printBanner, printSeparator, sessionNameBadge } from './ui/index.js';
```

change it to:

```typescript
import { printBanner, printSeparator, sessionNameBadge, selectPrompt, textPrompt, CANCEL } from './ui/index.js';
```

(Keep whatever names are already imported; only append the three new ones.)

- [ ] **Step 2: Replace `intro`**

Replace line 98:

```typescript
  intro(chalk.cyan.bold(' CLIC Setup '));
```

with:

```typescript
  console.log(chalk.cyan.bold('\n  CLIC Setup'));
```

- [ ] **Step 3: Replace the API-key `password`**

Replace the `if (!apiKey) { ... }` block (lines 102-115, the `password(...)` + `isCancel` branch) with:

```typescript
  if (!apiKey) {
    if (!process.stdout.isTTY) {
      console.log(chalk.red('  ❌ No API_KEY in environment and no interactive terminal to prompt for one.'));
      console.log(chalk.dim('     Set API_KEY in your environment or .env and retry.'));
      process.exit(1);
    }
    const keyInput = await textPrompt({
      message: 'OpenAI API Key:',
      mask: '*',
      validate: (val) => (val.length < 5 ? 'Please enter a valid API key' : undefined),
    });
    if (keyInput === CANCEL) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }
    apiKey = keyInput;
    process.env.API_KEY = apiKey;
  } else {
    console.log(chalk.green('  ✅ API_KEY loaded from environment.'));
  }
```

- [ ] **Step 4: Replace the model `select`**

Replace the `select(...)` + `isCancel` block (lines 135-145) with:

```typescript
        const modelChoice = await selectPrompt({
          message: 'Select the LLM model to use:',
          items: modelOptions,
        });

        if (modelChoice === CANCEL) {
          console.log(chalk.red('  Cancelled.'));
          process.exit(0);
        }

        model = modelChoice;
```

- [ ] **Step 5: Replace the role `select`**

Replace the `select(...)` + `isCancel` block (lines 182-192) with:

```typescript
    const roleChoice = await selectPrompt({
      message: 'Select a role:',
      items: roleOptions,
    });

    if (roleChoice === CANCEL) {
      console.log(chalk.red('  Cancelled.'));
      process.exit(0);
    }

    kbFile = roleChoice === '__none__' ? undefined : roleChoice;
```

- [ ] **Step 6: Replace `outro`**

Replace line 207:

```typescript
  outro(chalk.green(' Setup complete '));
```

with:

```typescript
  console.log(chalk.green('\n  ✅ Setup complete\n'));
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. (In particular, `modelChoice` / `roleChoice` are now `string`, not `string | symbol`, after the `=== CANCEL` narrowing.)

- [ ] **Step 8: Manually verify the wizard**

Run: `pnpm dev` (with `API_KEY` set) — the banner shows, "CLIC Setup" prints, the model picker and role picker are the new Ink pickers, selecting each works, and the REPL starts. Then temporarily `unset API_KEY` in a subshell and run `pnpm dev` to confirm the masked API-key prompt renders (type a key, see `*`).

- [ ] **Step 9: Stage and pause for review (do NOT commit)**

```bash
git add src/index.ts
```
Report completion. The user reviews and commits manually.

---

## Task 6: Migrate the REPL + single-turn confirm in `src/index.ts`

Replaces the two readline-based confirm functions with `confirmPrompt`. The tools themselves are unchanged — they call the injected `ConfirmFn`.

**Files:**
- Modify: `src/index.ts` (`createSingleTurnConfirmFn` ~lines 267-279 and its call site ~lines 293-294; `confirmFn` ~lines 387-398)

**Interfaces:**
- Consumes: `confirmPrompt` (Task 4), `ConfirmFn` type (existing). `confirmPrompt` handles the non-TTY → `false` fallback, so the readline try/catch is no longer needed.
- Produces: no new exports.

- [ ] **Step 1: Add `confirmPrompt` to the ui import**

Append `confirmPrompt` to the existing `./ui/index.js` import updated in Task 5:

```typescript
import { printBanner, printSeparator, sessionNameBadge, selectPrompt, textPrompt, confirmPrompt, CANCEL } from './ui/index.js';
```

- [ ] **Step 2: Simplify `createSingleTurnConfirmFn`**

Replace the `createSingleTurnConfirmFn` definition (lines 267-279) with a version that no longer takes a readline interface:

```typescript
  // ── Create confirm function ───────────────────────────────────────────────
  const createSingleTurnConfirmFn = (): ConfirmFn => {
    if (yolo) return async () => true;
    return async (message: string): Promise<boolean> => confirmPrompt({ message });
  };
```

- [ ] **Step 3: Update the single-turn call site**

In the single-turn block (around lines 292-294), replace:

```typescript
    const singleRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const singleConfirmFn = createSingleTurnConfirmFn(singleRl);
```

with:

```typescript
    const singleConfirmFn = createSingleTurnConfirmFn();
```

Then read the rest of the single-turn block to the end of the `if (prompt) { ... }` body. If `singleRl` is referenced anywhere else in that block (e.g. a `singleRl.close()`), remove those references too — `confirmPrompt` owns stdin per-call now, so no persistent interface is needed.

- [ ] **Step 4: Simplify the REPL `confirmFn`**

Replace the `confirmFn` definition (lines 387-398) with:

```typescript
  const confirmFn: ConfirmFn = yolo
    ? async () => true
    : async (message: string): Promise<boolean> => confirmPrompt({ message });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. (If `readline` is now unused in `src/index.ts`, the compiler will NOT error on the unused import by default; leave `readline` imported — it is still used by `ask()` for the REPL input loop.)

- [ ] **Step 6: Manually verify a tool confirmation**

Run: `pnpm dev` then ask: `create a file called scratch_confirm.txt with the text hi`. When the `write_file` confirm appears, confirm the new `▶ ... (y/N)` dialog renders; press `n` → rejected; retry and press `y` → the write proceeds. Then single-turn: `pnpm dev -- "read the file package.json"` and confirm the read confirmation dialog works. Delete `scratch_confirm.txt` afterward.

- [ ] **Step 7: Stage and pause for review (do NOT commit)**

```bash
git add src/index.ts
```
Report completion. The user reviews and commits manually.

---

## Task 7: Migrate `/model`, `/role`, `/privacy` commands

**Files:**
- Modify: `src/commands/model.ts`
- Modify: `src/commands/role.ts`
- Modify: `src/commands/privacy.ts`

**Interfaces:**
- Consumes: `selectPrompt`, `CANCEL` from `../ui/index.js`.
- Produces: no new exports.

- [ ] **Step 1: Migrate `src/commands/model.ts`**

Replace the import line 11:

```typescript
import { select, isCancel } from '@clack/prompts';
```

with:

```typescript
import { selectPrompt, CANCEL } from '../ui/index.js';
```

Replace the `select(...)` + `isCancel` block (lines 48-59) with:

```typescript
    const choice = await selectPrompt({
      message: `Select a model (current: ${ctx.model}):`,
      items: modelOptions,
    });

    if (choice === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }

    const newModel = choice;
```

- [ ] **Step 2: Migrate `src/commands/role.ts`**

Replace the import line 12:

```typescript
import { select, isCancel } from '@clack/prompts';
```

with:

```typescript
import { selectPrompt, CANCEL } from '../ui/index.js';
```

Replace the `select(...)` + `isCancel` block (lines 38-47) with:

```typescript
    const choice = await selectPrompt({
      message: 'Select a role:',
      items: roleOptions,
    });

    if (choice === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
```

(The subsequent `if (choice === '__none__')` and `const kbPath = choice as string;` lines stay; `choice` is now `string`, so the `as string` cast is harmless but may be removed.)

- [ ] **Step 3: Migrate `src/commands/privacy.ts`**

Replace the import line 17:

```typescript
import { select, isCancel } from '@clack/prompts';
```

with:

```typescript
import { selectPrompt, CANCEL } from '../ui/index.js';
```

Replace the `select(...)` + `isCancel` block (lines 61-74) with:

```typescript
    const choice = await selectPrompt({
      message: `Privacy mode (current: ${current ? 'ON' : 'OFF'}):`,
      initialValue: current ? 'on' : 'off',
      items: [
        { value: 'off', label: 'Off — normal', hint: 'History, token graph & session index are saved to disk' },
        { value: 'on', label: 'On — ephemeral', hint: 'Nothing written to disk — for sensitive/throwaway work' },
      ],
    });

    if (choice === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
```

(`const to = choice === 'on';` stays unchanged.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Manually verify each command**

Run: `pnpm dev`, then in the REPL: `/model` (picker appears, switch works), `/role` (picker appears, switch works), `/privacy` (picker appears with the CURRENT mode pre-highlighted via `initialValue`, toggling prints the warning lines).

- [ ] **Step 6: Stage and pause for review (do NOT commit)**

```bash
git add src/commands/model.ts src/commands/role.ts src/commands/privacy.ts
```
Report completion. The user reviews and commits manually.

---

## Task 8: Migrate `/export` and `/session` commands

**Files:**
- Modify: `src/commands/export.ts` (2× `select`)
- Modify: `src/commands/session.ts` (2× `text`, 2× `select`, 1× `confirm`)

**Interfaces:**
- Consumes: `selectPrompt`, `textPrompt`, `confirmPrompt`, `CANCEL` from `../ui/index.js`.
- Produces: no new exports.

- [ ] **Step 1: Migrate `src/commands/export.ts` imports**

Replace line 10:

```typescript
import { select, isCancel } from '@clack/prompts';
```

with:

```typescript
import { selectPrompt, CANCEL } from '../ui/index.js';
```

- [ ] **Step 2: Migrate the export format `select`**

Replace the `select(...)` + `isCancel` block (lines 179-192) with:

```typescript
      const picked = await selectPrompt({
        message: 'Export format:',
        items: [
          { value: 'markdown', label: 'Markdown', hint: 'Human-readable .md file' },
          { value: 'json',     label: 'JSON',     hint: 'Raw message array with metadata' },
          { value: 'html',     label: 'HTML',     hint: 'Self-contained styled page' },
        ],
      });
      if (picked === CANCEL) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }
      format = picked as Format;
```

- [ ] **Step 3: Migrate the export scope `select`**

Replace the `select(...)` + `isCancel` block (lines 207-212) with:

```typescript
      const pickedScope = await selectPrompt({ message: 'Export scope:', items: scopeOptions });
      if (pickedScope === CANCEL) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }
```

- [ ] **Step 4: Migrate `src/commands/session.ts` imports**

Replace line 17:

```typescript
import { text, confirm, select, isCancel } from '@clack/prompts';
```

with:

```typescript
import { selectPrompt, textPrompt, confirmPrompt, CANCEL } from '../ui/index.js';
```

- [ ] **Step 5: Migrate `handleNew` text input**

Replace the `text(...)` + `isCancel` block (lines 40-49) with:

```typescript
    const input = await textPrompt({
      message: 'New session name:',
      placeholder: 'e.g. debug-prod',
      validate: (v) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? undefined : 'Use letters, digits, - and _ only'),
    });
    if (input === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    sessionName = input.trim();
```

- [ ] **Step 6: Migrate `handleSwitch` select**

Replace the `select(...)` + `isCancel` block (lines 81-97) with:

```typescript
    const choice = await selectPrompt({
      message: `Switch to session (current: ${active}):`,
      items: others.map(s => {
        const summary = getSessionTokenSummary(sessionNodeId(s.name));
        return {
          value: s.name,
          label: s.name,
          hint: `${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens`,
        };
      }),
    });
    if (choice === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    target = choice;
```

- [ ] **Step 7: Migrate `handleRename` text input**

Replace the `text(...)` + `isCancel` block (lines 119-128) with:

```typescript
    const input = await textPrompt({
      message: `Rename session "${active}" to:`,
      validate: (v) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? undefined : 'Use letters, digits, - and _ only'),
    });
    if (input === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    newName = input.trim();
```

- [ ] **Step 8: Migrate `handleDelete` select + confirm**

Replace the `select(...)` + `isCancel` block (lines 176-192) with:

```typescript
    const choice = await selectPrompt({
      message: 'Select session to delete:',
      items: deletable.map(s => {
        const summary = getSessionTokenSummary(sessionNodeId(s.name));
        return {
          value: s.name,
          label: s.name,
          hint: `${summary.turnCount} turns · ${summary.totalTokens.toLocaleString()} tokens`,
        };
      }),
    });
    if (choice === CANCEL) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }
    target = choice;
```

Then replace the `confirm(...)` + guard (lines 206-211) with:

```typescript
  const ok = await confirmPrompt({ message: `Delete session "${target}" and its history? This cannot be undone.` });
  if (!ok) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return { type: 'continue' };
  }
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 10: Manually verify**

Run: `pnpm dev`, then: `/export` (format picker + scope picker both render, export writes a file); `/session new` (text input), `/session switch` (picker), `/session rename` (text input), `/session delete <name>` (picker + `(y/N)` confirm). Use throwaway session names and delete them afterward.

- [ ] **Step 11: Stage and pause for review (do NOT commit)**

```bash
git add src/commands/export.ts src/commands/session.ts
```
Report completion. The user reviews and commits manually.

---

## Task 9: Remove `@clack/prompts` and final verification

**Files:**
- Modify: `package.json` (+ `pnpm-lock.yaml`)

**Interfaces:**
- Consumes: nothing — this is the teardown + gate.
- Produces: a build with no `@clack/prompts` dependency.

- [ ] **Step 1: Verify no `@clack` imports remain**

Run: `grep -rn "@clack/prompts" src/`
Expected: **no output**. If any line prints, migrate it (same pattern as Tasks 5-8) before continuing.

- [ ] **Step 2: Remove the dependency**

Run: `pnpm remove @clack/prompts`
Expected: `package.json` no longer lists `@clack/prompts`; `pnpm-lock.yaml` updated.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors (confirms nothing still imports the removed package).

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: **248 passed**, 0 failed.

- [ ] **Step 5: Production build**

Run: `pnpm build`
Expected: `tsup` produces `dist/` with no errors.

- [ ] **Step 6: Smoke-test the built binary**

Run: `node dist/index.js -- "list the files in the current directory then stop"` (with `API_KEY`/`--model` set as needed)
Expected: runs a single turn, the tool confirmation dialog renders (or auto-approves with `--yolo`), no crash, clean exit.

- [ ] **Step 7: Stage and pause for review (do NOT commit)**

```bash
git add package.json pnpm-lock.yaml
```
Report completion. Phase 4 is done — `@clack/prompts` fully removed, all interactive surfaces are Ink. The user reviews and commits manually.

---

## Self-Review

**1. Spec coverage** (against the updated Phase 4 section of `docs/superpowers/specs/2026-10-26-ink-tui-migration-design.md`):
- Full `@clack` removal → Tasks 5-9. ✅
- Coexistence with readline REPL (one-shot mount) → `interactive` adapter (Task 2), Global Constraints. ✅
- `interactive<T>` adapter via `_renderQueue` → Task 2. ✅
- `<SelectPicker>` / `<TextPrompt>` / `<ConfirmDialog>` on Ink primitives → Tasks 2/3/4. ✅
- Full migration surface (7 select, 2 text, 1 confirm, password, intro/outro, tool confirmFn) → Tasks 5-8 (every row of the spec's table maps to a step). ✅
- Cancellation contract (`CANCEL` sentinel; confirm→false) → Task 1 + each migration. ✅
- Non-TTY contract (select→default, confirm→false, textPrompt→CANCEL, API-key→exit) → adapters (Tasks 2-4) + Task 5 Step 3. ✅
- Dependency change (`pnpm remove @clack/prompts`, nothing added) → Task 9. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code step contains the literal code. ✅

**3. Type consistency:** `CANCEL: unique symbol`, `SelectItem<T>`, and `selectInitialIndex` (Task 1) are consumed verbatim by `SelectPicker` (Task 2) and the adapters. Adapter signatures (`selectPrompt`/`textPrompt`/`confirmPrompt`) are identical in their "Produces" blocks and at every call site. `fetchAvailableModelOptions()` returns `{value,label,hint}`, structurally assignable to `SelectItem<string>[]`. After `=== CANCEL` narrowing, `choice`/`modelChoice`/`roleChoice` are `string`, matching the downstream assignments. ✅
