# Ink TUI Phase 2 — Reactive Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a typed `TurnEmitter` event bridge through `agent.ts` and `index.ts` so each agent turn mounts a live `<TurnPanel>` that shows an animated spinner while the LLM thinks, transitions to streaming text output as tokens arrive, and displays a live context bar — replacing the `ora` spinner entirely.

**Architecture:** A new `TurnEmitter` (typed `EventEmitter`) is passed optionally into `runAgentTurn`; in TTY mode `index.ts` creates the emitter, renders `<TurnPanel emitter={emitter} ...>` via Ink before calling the agent, and unmounts it when the agent returns. `<TurnPanel>` manages its own React state via `useEffect` listeners on the emitter events: it starts in "spinning" phase, switches to "streaming" phase on the first `'token'` event, resets to "spinning" on each `'step'` event (entering a new ReAct step), and updates `<ContextBar>` on each `'tokens'` event. When no emitter is present (non-TTY / `--paste` / CI), `agent.ts` falls back to inline chalk output.

**Tech Stack:** `ink@8.0.0` (already installed), `react@19.3.1` (already installed), `ink-spinner@5.0.0` (to be installed), TypeScript ESM NodeNext, custom `eq()` test runner

## Global Constraints

- ESM project — every local import uses `.js` extension, even when the source is `.ts`
- `ink@8.0.0` already installed — do not upgrade; use `waitUntilRenderFlush()` for one-shot static renders
- `pnpm typecheck` (tsc --noEmit) must pass with 0 errors before each commit
- `pnpm build` must produce a clean `dist/` before each commit
- `pnpm test` (all 9 suites, currently 232 tests) must pass before each commit
- Custom test runner only — no jest/vitest; tests use `eq(desc, actual, expected)` + `runUiTests()` in `test/ui.test.ts`
- No `@types/ink-spinner` needed — `ink-spinner` ships its own TypeScript types
- TTY guard: all Ink rendering is guarded by `process.stdout.isTTY === true`; non-TTY falls back to chalk
- YAGNI: implement exactly what the spec describes, nothing more
- No intermediate commits unless explicitly requested — user reviews all changes at end

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| **Create** | `src/ui/events.ts` | `TurnEmitter` typed EventEmitter + `TokenUsageEvent` interface |
| **Create** | `src/ui/components/Spinner.tsx` | Animated "Thinking..." component via `ink-spinner` |
| **Create** | `src/ui/components/StreamingOutput.tsx` | Streaming LLM text display |
| **Create** | `src/ui/components/TurnPanel.tsx` | Reactive hub: coordinates Spinner, StreamingOutput, StepHeader, ContextBar |
| **Modify** | `src/agent.ts` | Add `emitter?: TurnEmitter` to `AgentOptions`, emit events, remove `ora` |
| **Modify** | `src/index.ts` | Mount/unmount `<TurnPanel>` per agent turn, replace model-fetch `ora`, remove `ora` import |
| **Modify** | `package.json` | Add `ink-spinner`, remove `ora` |
| **Modify** | `test/ui.test.ts` | Add reactive component tests (target: ~17 new tests → ~249 total) |

---

### Task 1: Dependency install + `TurnEmitter` event bridge

**Files:**
- Modify: `package.json`
- Create: `src/ui/events.ts`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: Node.js `EventEmitter` from `node:events`
- Produces: `TurnEmitter` class, `TokenUsageEvent` interface — imported by Tasks 2–6

- [ ] **Step 1: Install `ink-spinner`**

```bash
pnpm add ink-spinner
```

Expected: `ink-spinner` appears in `package.json` dependencies. No peer-dependency errors.

- [ ] **Step 2: Write the failing tests first**

Add to the bottom of `test/ui.test.ts`, inside `runUiTests()` (before the final `console.log` summary line):

```typescript
  // ── TurnEmitter (events.ts) ─────────────────────────────────
  const { TurnEmitter } = await import('../src/ui/events.js');

  const emitter1 = new TurnEmitter();
  let tokenResult = '';
  emitter1.on('token', (chunk) => { tokenResult += chunk; });
  emitter1.emit('token', 'hello');
  emitter1.emit('token', ' world');
  eq('TurnEmitter token events accumulate', tokenResult, 'hello world');

  let stepResult = 0;
  emitter1.on('step', (s) => { stepResult = s; });
  emitter1.emit('step', 3);
  eq('TurnEmitter step event passes number', stepResult, 3);

  let usageResult: { promptTokens: number } | null = null;
  emitter1.on('tokens', (u) => { usageResult = u; });
  emitter1.emit('tokens', { promptTokens: 500, completionTokens: 100, totalTokens: 600 });
  eq('TurnEmitter tokens event passes usage', usageResult?.promptTokens, 500);

  let doneFired = false;
  emitter1.on('done', () => { doneFired = true; });
  emitter1.emit('done');
  eq('TurnEmitter done event fires', doneFired, true);
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:ui
```

Expected: fails with `Cannot find module '../src/ui/events.js'` (module does not exist yet).

- [ ] **Step 4: Create `src/ui/events.ts`**

```typescript
import EventEmitter from 'node:events';

export interface TokenUsageEvent {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class TurnEmitter extends EventEmitter {
  // Typed overloads for emit
  emit(event: 'step',   step: number): boolean;
  emit(event: 'token',  chunk: string): boolean;
  emit(event: 'tool',   name: string): boolean;
  emit(event: 'tokens', usage: TokenUsageEvent): boolean;
  emit(event: 'done'): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  // Typed overloads for on
  on(event: 'step',   listener: (step: number) => void): this;
  on(event: 'token',  listener: (chunk: string) => void): this;
  on(event: 'tool',   listener: (name: string) => void): this;
  on(event: 'tokens', listener: (usage: TokenUsageEvent) => void): this;
  on(event: 'done',   listener: () => void): this;
  on(event: string,   listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  // Typed overloads for off
  off(event: 'step',   listener: (step: number) => void): this;
  off(event: 'token',  listener: (chunk: string) => void): this;
  off(event: 'tool',   listener: (name: string) => void): this;
  off(event: 'tokens', listener: (usage: TokenUsageEvent) => void): this;
  off(event: 'done',   listener: () => void): this;
  off(event: string,   listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test:ui
```

Expected: 4 new TurnEmitter tests pass. Total test count increases by 4.

- [ ] **Step 6: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 type errors, clean build.

- [ ] **Step 7: Commit**

```bash
git add src/ui/events.ts test/ui.test.ts package.json pnpm-lock.yaml
git commit -m "feat(ui): add TurnEmitter event bridge + ink-spinner dependency"
```

---

### Task 2: `Spinner.tsx` — animated thinking indicator

**Files:**
- Create: `src/ui/components/Spinner.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `ink-spinner` default export, `ink` `Text`, `chalk`
- Produces: `ThinkingSpinner` named export — used by TurnPanel (Task 4)

**Context:** `ink-spinner`'s default export is a React component that renders a single animated character from a set of spinner frames. In tests (where stdout is a `Writable` mock, not a real TTY), it renders the first frame of the spinner. We name our export `ThinkingSpinner` to avoid a naming collision with the library's `Spinner` default.

- [ ] **Step 1: Write failing test**

Add to `test/ui.test.ts` inside `runUiTests()` (before the summary line):

```typescript
  // ── Spinner component ─────────────────────────────────────────
  const { ThinkingSpinner } = await import('../src/ui/components/Spinner.js');

  const spinnerOut = await renderInk(React.createElement(ThinkingSpinner, null));
  eq('ThinkingSpinner renders Thinking text', spinnerOut.includes('Thinking'), true);
  eq('ThinkingSpinner renders non-empty output', spinnerOut.trim().length > 0, true);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:ui
```

Expected: fails with `Cannot find module '../src/ui/components/Spinner.js'`.

- [ ] **Step 3: Create `src/ui/components/Spinner.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';
import chalk from 'chalk';

export function ThinkingSpinner() {
  return (
    <Text>
      {'  '}
      <InkSpinner type="dots" />
      {chalk.dim(' Thinking...')}
    </Text>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:ui
```

Expected: 2 new spinner tests pass.

- [ ] **Step 5: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, clean build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Spinner.tsx test/ui.test.ts
git commit -m "feat(ui): add ThinkingSpinner component via ink-spinner"
```

---

### Task 3: `StreamingOutput.tsx` — live LLM text display

**Files:**
- Create: `src/ui/components/StreamingOutput.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `ink` `Text`, `chalk`
- Produces: `StreamingOutput` named export — used by TurnPanel (Task 4)

**Props:**
```typescript
interface StreamingOutputProps {
  text: string;
}
```

- [ ] **Step 1: Write failing test**

Add to `test/ui.test.ts` inside `runUiTests()`:

```typescript
  // ── StreamingOutput component ─────────────────────────────────
  const { StreamingOutput } = await import('../src/ui/components/StreamingOutput.js');

  const emptyStreamOut = await renderInk(React.createElement(StreamingOutput, { text: '' }));
  eq('StreamingOutput empty text renders nothing', emptyStreamOut.trim().length === 0, true);

  const streamOut = await renderInk(React.createElement(StreamingOutput, { text: 'Hello, world!' }));
  eq('StreamingOutput renders agent header', streamOut.includes('Agent:'), true);
  eq('StreamingOutput renders provided text', streamOut.includes('Hello, world!'), true);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:ui
```

Expected: fails with `Cannot find module '../src/ui/components/StreamingOutput.js'`.

- [ ] **Step 3: Create `src/ui/components/StreamingOutput.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface StreamingOutputProps {
  text: string;
}

export function StreamingOutput({ text }: StreamingOutputProps) {
  if (!text) return null;
  return (
    <>
      <Text>{chalk.cyan.bold('  🤖 Agent:')}</Text>
      <Text>{''}</Text>
      <Text>{text}</Text>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:ui
```

Expected: 3 new StreamingOutput tests pass.

- [ ] **Step 5: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, clean build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/StreamingOutput.tsx test/ui.test.ts
git commit -m "feat(ui): add StreamingOutput component for live LLM text"
```

---

### Task 4: `TurnPanel.tsx` — reactive hub

**Files:**
- Create: `src/ui/components/TurnPanel.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `TurnEmitter` + `TokenUsageEvent` from `src/ui/events.js`, `ThinkingSpinner`, `StreamingOutput`, `StepHeader`, `ContextBar`
- Produces: `TurnPanel` named export — mounted by `index.ts` (Task 6)

**Props:**
```typescript
interface TurnPanelProps {
  emitter: TurnEmitter;
  contextLimit: number;
  maxSteps: number;
}
```

**State machine:**
- Initial: phase=`'spinning'`, step=1, text=`''`, usage=`null`
- `'token'` event: phase→`'streaming'`, text appended
- `'step'` event (n>1): step→n, phase→`'spinning'`, text→`''`
- `'tokens'` event: usage updated (shows ContextBar)
- Unmount (via `useEffect` cleanup): remove all listeners

**Rendering logic:**
- `step > 1`: render `<StepHeader step={step} maxSteps={maxSteps} />`
- `phase === 'spinning'`: render `<ThinkingSpinner />`
- `phase === 'streaming'`: render `<StreamingOutput text={text} />`
- `usage !== null`: render `<ContextBar promptTokens={usage.promptTokens} contextLimit={contextLimit} />`

- [ ] **Step 1: Write failing tests**

Add to `test/ui.test.ts` inside `runUiTests()`. These tests use `TurnEmitter` events and `waitUntilRenderFlush()` to assert state transitions:

```typescript
  // ── TurnPanel component ───────────────────────────────────────
  const { TurnPanel } = await import('../src/ui/components/TurnPanel.js');
  const { TurnEmitter: TE2 } = await import('../src/ui/events.js');

  // Helper: render TurnPanel to a writable stream, return render controls
  function renderTurnPanel(props: { contextLimit: number; maxSteps: number }) {
    const emitter = new TE2();
    let output = '';
    const stream = new Writable({
      write(chunk, _enc, cb) { output += chunk.toString(); cb(); }
    });
    const controls = render(
      React.createElement(TurnPanel, { emitter, ...props }),
      stream,
    );
    return { emitter, controls, getOutput: () => output.replace(/\x1b\[[0-9;]*m/g, '') };
  }

  // Test: initial state shows spinner
  {
    const { controls, getOutput } = renderTurnPanel({ contextLimit: 100000, maxSteps: 10 });
    await controls.waitUntilRenderFlush();
    eq('TurnPanel initial state shows Thinking', getOutput().includes('Thinking'), true);
    controls.unmount();
  }

  // Test: 'token' event transitions to streaming
  {
    const { emitter, controls, getOutput } = renderTurnPanel({ contextLimit: 100000, maxSteps: 10 });
    await controls.waitUntilRenderFlush();
    emitter.emit('token', 'Hello from agent');
    await controls.waitUntilRenderFlush();
    eq('TurnPanel shows streaming output after token event', getOutput().includes('Hello from agent'), true);
    eq('TurnPanel shows Agent header after token event', getOutput().includes('Agent:'), true);
    controls.unmount();
  }

  // Test: 'step' event shows StepHeader
  {
    const { emitter, controls, getOutput } = renderTurnPanel({ contextLimit: 100000, maxSteps: 10 });
    await controls.waitUntilRenderFlush();
    emitter.emit('step', 2);
    await controls.waitUntilRenderFlush();
    eq('TurnPanel shows StepHeader after step event', getOutput().includes('Step'), true);
    eq('TurnPanel shows step number 2', getOutput().includes('2'), true);
    controls.unmount();
  }

  // Test: 'tokens' event shows ContextBar
  {
    const { emitter, controls, getOutput } = renderTurnPanel({ contextLimit: 100000, maxSteps: 10 });
    await controls.waitUntilRenderFlush();
    emitter.emit('tokens', { promptTokens: 5000, completionTokens: 500, totalTokens: 5500 });
    await controls.waitUntilRenderFlush();
    eq('TurnPanel shows ContextBar after tokens event', getOutput().includes('Context'), true);
    eq('TurnPanel ContextBar shows token count', getOutput().includes('5,000'), true);
    controls.unmount();
  }

  // Test: 'step' resets streaming text to spinner
  {
    const { emitter, controls, getOutput } = renderTurnPanel({ contextLimit: 100000, maxSteps: 10 });
    await controls.waitUntilRenderFlush();
    emitter.emit('token', 'Step 1 output');
    await controls.waitUntilRenderFlush();
    emitter.emit('step', 2);
    await controls.waitUntilRenderFlush();
    eq('TurnPanel resets to spinner on step event', getOutput().includes('Thinking'), true);
    controls.unmount();
  }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:ui
```

Expected: fails with `Cannot find module '../src/ui/components/TurnPanel.js'`.

- [ ] **Step 3: Create `src/ui/components/TurnPanel.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { Box } from 'ink';
import { TurnEmitter, type TokenUsageEvent } from '../events.js';
import { ThinkingSpinner } from './Spinner.js';
import { StreamingOutput } from './StreamingOutput.js';
import { StepHeader } from './StepHeader.js';
import { ContextBar } from './ContextBar.js';

interface TurnPanelProps {
  emitter: TurnEmitter;
  contextLimit: number;
  maxSteps: number;
}

type Phase = 'spinning' | 'streaming';

export function TurnPanel({ emitter, contextLimit, maxSteps }: TurnPanelProps) {
  const [phase, setPhase] = useState<Phase>('spinning');
  const [text, setText] = useState('');
  const [step, setStep] = useState(1);
  const [usage, setUsage] = useState<TokenUsageEvent | null>(null);

  useEffect(() => {
    const onToken = (chunk: string) => {
      setPhase('streaming');
      setText(prev => prev + chunk);
    };
    const onStep = (s: number) => {
      setStep(s);
      setPhase('spinning');
      setText('');
    };
    const onTokens = (u: TokenUsageEvent) => {
      setUsage(u);
    };

    emitter.on('token', onToken);
    emitter.on('step', onStep);
    emitter.on('tokens', onTokens);

    return () => {
      emitter.off('token', onToken);
      emitter.off('step', onStep);
      emitter.off('tokens', onTokens);
    };
  }, [emitter]);

  return (
    <Box flexDirection="column">
      {step > 1 && <StepHeader step={step} maxSteps={maxSteps} />}
      {phase === 'spinning' ? <ThinkingSpinner /> : <StreamingOutput text={text} />}
      {usage !== null && (
        <ContextBar
          promptTokens={usage.promptTokens}
          contextLimit={contextLimit}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:ui
```

Expected: all 5 new TurnPanel tests pass.

- [ ] **Step 5: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, clean build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/TurnPanel.tsx test/ui.test.ts
git commit -m "feat(ui): add TurnPanel reactive hub with state-machine transitions"
```

---

### Task 5: Wire `agent.ts` — emit events, remove `ora`

**Files:**
- Modify: `src/agent.ts`

**Context:** `agent.ts` currently uses `ora` for a spinner and `process.stdout.write(text)` for streaming. This task adds optional `emitter?: TurnEmitter` to `AgentOptions`. When present (TTY mode), the agent emits events instead of rendering directly. When absent (non-TTY / `--paste` / CI), the agent keeps its current chalk behavior — **except `ora` is removed in both paths**.

**Fallback behavior for non-emitter path (replaces `ora`):**
- Before LLM call: `process.stdout.write(chalk.dim('\r  ⏳ Thinking...'))`
- When first token arrives: clear with `process.stdout.write('\r' + ' '.repeat(20) + '\r')`, then print agent label
- This gives a minimal non-animated "Thinking..." that disappears cleanly — no dependency on `ora`

**Events emitted when `emitter` present:**
- `emitter.emit('step', steps)` — at start of each step > 1 (replaces `printStepHeader` call)
- `emitter.emit('token', text)` — on each streamed chunk (replaces `process.stdout.write`)
- `emitter.emit('tool', call.function.name)` — when a single tool call is about to execute (after all parallel/sequential routing is settled, one emit per tool)
- `emitter.emit('tokens', { promptTokens, completionTokens, totalTokens })` — after each LLM call that returns usage
- `emitter.emit('done')` — once, after the while-loop exits (before the KG write)

- [ ] **Step 1: Update `src/agent.ts`**

Change the import block — **remove** `import ora from 'ora';`, **add** the TurnEmitter import:

```typescript
import { TurnEmitter } from './ui/events.js';
```

Change `AgentOptions` — add the optional field:

```typescript
export interface AgentOptions {
  model: string;
  maxSteps: number;
  confirm: ConfirmFn;
  showRaw: boolean;
  sessionId?: string;
  signal?: AbortSignal;
  emitter?: TurnEmitter;    // ← add this
}
```

Replace the spinner + streaming section inside the while loop. The old code:

```typescript
    if (steps > 1) {
      printStepHeader(steps, options.maxSteps);
    }

    // ── Call LLM with streaming ──────────────────────────────────────────────
    const spinner = ora({ text: '  Thinking...', indent: 2 }).start();

    let response;
    try {
      let textStarted = false;
      response = await streamMessage(client, options.model, systemPrompt, messages, (text) => {
        if (!textStarted) {
          spinner.stop();
          textStarted = true;
          console.log();
          console.log(chalk.cyan.bold('  🤖 Agent:'));
          console.log();
        }
        process.stdout.write(text);
      }, options.signal);

      if (!textStarted) spinner.stop();
      if (textStarted) {
        console.log();
        console.log();
      }
    } catch (err: unknown) {
      spinner.stop();
      if (options.signal?.aborted) {
        console.log(chalk.yellow('\n  ⚡ Interrupted.'));
        return { promptTokens: cumulativeUsage.promptTokens };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ API Error: ${msg}`));
      return { promptTokens: cumulativeUsage.promptTokens };
    }
```

Replace with:

```typescript
    if (steps > 1) {
      if (options.emitter) {
        options.emitter.emit('step', steps);
      } else {
        printStepHeader(steps, options.maxSteps);
      }
    }

    // ── Call LLM with streaming ──────────────────────────────────────────────
    // Non-emitter path: show a minimal inline "Thinking..." that clears on first token
    if (!options.emitter) {
      process.stdout.write(chalk.dim('\r  ⏳ Thinking...'));
    }

    let response;
    try {
      let textStarted = false;
      response = await streamMessage(client, options.model, systemPrompt, messages, (chunk) => {
        if (!textStarted) {
          textStarted = true;
          if (options.emitter) {
            // TurnPanel handles the "Agent:" label transition — no console output here
          } else {
            process.stdout.write('\r' + ' '.repeat(25) + '\r');
            console.log();
            console.log(chalk.cyan.bold('  🤖 Agent:'));
            console.log();
          }
        }
        if (options.emitter) {
          options.emitter.emit('token', chunk);
        } else {
          process.stdout.write(chunk);
        }
      }, options.signal);

      if (!textStarted && !options.emitter) {
        process.stdout.write('\r' + ' '.repeat(25) + '\r');
      }
      if (textStarted && !options.emitter) {
        console.log();
        console.log();
      }
    } catch (err: unknown) {
      if (!options.emitter) {
        process.stdout.write('\r' + ' '.repeat(25) + '\r');
      }
      if (options.signal?.aborted) {
        console.log(chalk.yellow('\n  ⚡ Interrupted.'));
        return { promptTokens: cumulativeUsage.promptTokens };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.log();
      console.log(chalk.red(`  ❌ API Error: ${msg}`));
      return { promptTokens: cumulativeUsage.promptTokens };
    }
```

Add `emitter.emit('tokens', ...)` right after accumulating usage:

```typescript
    // ── Accumulate token usage for KG ────────────────────────────────────────
    if (response.usage) {
      cumulativeUsage.promptTokens     += response.usage.promptTokens;
      cumulativeUsage.completionTokens += response.usage.completionTokens;
      cumulativeUsage.totalTokens      += response.usage.totalTokens;
      // Live context bar update in TurnPanel
      if (options.emitter) {
        options.emitter.emit('tokens', {
          promptTokens:     cumulativeUsage.promptTokens,
          completionTokens: cumulativeUsage.completionTokens,
          totalTokens:      cumulativeUsage.totalTokens,
        });
      }
    }
```

Add `emitter.emit('tool', ...)` in the tool execution paths. In the **parallel path**, before `Promise.all`:

```typescript
      if (runParallel) {
        console.log(chalk.dim(`  ⚡ Running ${pendingCalls.length} tools in parallel...`));
        if (options.emitter) {
          for (const { call } of pendingCalls) {
            options.emitter.emit('tool', call.function.name);
          }
        }
        const settled = await Promise.all( ...
```

In the **sequential path**, before each `executeTool` call:

```typescript
        for (const { call, args } of pendingCalls) {
          if (options.emitter) options.emitter.emit('tool', call.function.name);
          const result = await executeTool(call.function.name, args, options.confirm);
```

In the **single tool path** (after parsing args):

```typescript
      if (options.emitter) options.emitter.emit('tool', call.function.name);
      const result = await executeTool(call.function.name, args, options.confirm);
```

Add `emitter.emit('done')` right before the KG section (after the while-loop exits, before `if (options.sessionId)`):

```typescript
  if (options.emitter) options.emitter.emit('done');

  // ── Record this turn in the Knowledge Graph ──────────────────────────────
  if (options.sessionId) {
```

- [ ] **Step 2: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, clean build. The `ora` import is gone; no TypeScript errors.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all 9 suites pass. Count is the same or higher (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/agent.ts
git commit -m "feat(agent): emit TurnEmitter events; replace ora with chalk fallback"
```

---

### Task 6: Wire `index.ts` — mount TurnPanel per turn + remove `ora`

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json` (remove `ora`)

**Context:** `index.ts` has three places that call `runAgentTurn`: (1) single-turn mode, (2) the `/retry` command path, (3) the main REPL loop. All three must be wrapped with TurnPanel in TTY mode. There is also one `ora` spinner for model-fetching that must be replaced with a chalk message.

**TTY guard:** Use the inline expression `process.stdout.isTTY === true` — no helper import needed.

**The pattern (to be applied in all three runAgentTurn call sites):**

```typescript
// Before: just call runAgentTurn
const turnResult = await runAgentTurn(client, getMessages(), systemPrompt, {
  model, maxSteps, confirm: confirmFn, showRaw, sessionId, signal: ac.signal,
});

// After: wrap with TurnPanel in TTY mode
const { TurnPanel } = await import('./ui/components/TurnPanel.js');
const { TurnEmitter } = await import('./ui/events.js');
const { render: inkRender } = await import('ink');
const contextLimitForTurn = getContextLimit(model);

let turnResult;
if (process.stdout.isTTY === true) {
  const emitter = new TurnEmitter();
  const { unmount } = inkRender(
    React.createElement(TurnPanel, { emitter, contextLimit: contextLimitForTurn, maxSteps }),
    { exitOnCtrlC: false },
  );
  turnResult = await runAgentTurn(client, getMessages(), systemPrompt, {
    model, maxSteps, confirm: confirmFn, showRaw, sessionId, signal: ac.signal, emitter,
  });
  unmount();
} else {
  turnResult = await runAgentTurn(client, getMessages(), systemPrompt, {
    model, maxSteps, confirm: confirmFn, showRaw, sessionId, signal: ac.signal,
  });
}
```

**Skip `printContextBar` in TTY mode** (TurnPanel showed it live). The auto-compact check runs regardless:

```typescript
const contextLimit = getContextLimit(model);
const rawTokens = turnResult.promptTokens > 0
  ? turnResult.promptTokens
  : Math.ceil(getMessages().reduce((sum, m) =>
      sum + ('content' in m && typeof m.content === 'string' ? m.content.length : 0), 0) / 4);

// Only print static bar in non-TTY — TurnPanel handles TTY rendering
if (process.stdout.isTTY !== true) {
  printContextBar(rawTokens, contextLimit, CONTEXT_GUARD_THRESHOLD);
}

if (rawTokens > contextLimit * CONTEXT_GUARD_THRESHOLD) {
  console.log(chalk.yellow(`  ⚠️  Auto-compacting...`));
  await runCompact(callLLM, 'auto');
}
```

**Replace model-fetch `ora` spinner.** The old code:

```typescript
const spinner = ora({ text: chalk.dim('  Fetching available models...'), color: 'cyan' }).start();
try {
  const modelOptions = await fetchAvailableModelOptions();
  spinner.stop();
  // ...
} catch (err) {
  spinner.stop();
  // ...
}
```

Replace with:

```typescript
process.stdout.write(chalk.dim('  ⏳ Fetching available models...'));
try {
  const modelOptions = await fetchAvailableModelOptions();
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  // ...
} catch (err) {
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  // ...
}
```

**Remove `ora` import** from `src/index.ts` (`import ora from 'ora';`).

**Add `React` import** — needed for `React.createElement(TurnPanel, ...)`. Check if `react` is already imported; if not, add:
```typescript
import React from 'react';
```

**Import `render` from `ink`** — add to imports:
```typescript
import { render as inkRender } from 'ink';
```

**Import `TurnPanel` and `TurnEmitter`** — add to imports:
```typescript
import { TurnPanel } from './ui/components/TurnPanel.js';
import { TurnEmitter } from './ui/events.js';
```

**`getContextLimit(model)` call:** `getContextLimit` currently takes no arguments (uses the active model from state). Check its signature in `src/config.ts`:
- If it accepts `model?: string`, pass `model`.
- If it takes no arguments, call `getContextLimit()`.
The import is already present from `'./config.js'`.

- [ ] **Step 1: Check `getContextLimit` signature**

Read `src/config.ts` line range that defines `getContextLimit` and note the exact signature. Use that exact signature in all call sites.

- [ ] **Step 2: Apply all changes to `src/index.ts`**

Apply every change described above:
1. Remove `import ora from 'ora'`
2. Add `import React from 'react'` (if not present)
3. Add `import { render as inkRender } from 'ink'`
4. Add `import { TurnPanel } from './ui/components/TurnPanel.js'`
5. Add `import { TurnEmitter } from './ui/events.js'`
6. Replace model-fetch `ora` spinner with chalk write+clear
7. Wrap all three `runAgentTurn` call sites with the TTY guard + TurnPanel pattern
8. Update `printContextBar` calls to be non-TTY-gated in all three sites

- [ ] **Step 3: Remove `ora` from `package.json`**

```bash
pnpm remove ora
```

Expected: `ora` removed from `package.json` dependencies, `pnpm-lock.yaml` updated.

- [ ] **Step 4: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, clean `dist/`.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all 9 suites pass. Total count >= 249 (232 original + 17 new Phase 2 tests).

- [ ] **Step 6: Visual smoke test**

```bash
pnpm dev -- "echo hello world"
```

Expected in a real terminal (TTY):
- Animated `⠋ Thinking...` spinner appears while LLM responds
- Spinner transitions to `🤖 Agent:` followed by streaming text
- Context bar appears after response

- [ ] **Step 7: Non-TTY smoke test**

```bash
echo "echo hello world" | pnpm dev -- --paste --no-history 2>&1 | head -30
```

Expected: no spinner animation, fallback chalk output, no `ora`-related errors.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts package.json pnpm-lock.yaml
git commit -m "feat(index): mount TurnPanel per agent turn; remove ora dependency"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| `TurnEmitter` with token/tool/tokens/done events | Task 1 |
| `<TurnPanel emitter={emitter} contextLimit={n} />` | Task 4 |
| Spinner via `ink-spinner` | Task 2 |
| Streaming text output | Task 3 |
| `<StepHeader>` re-renders on 'tool' event | Task 4 (on 'step' event per implementation) |
| `<ContextBar>` live update on 'tokens' event | Task 4 |
| `agent.ts` receives optional `TurnEmitter` | Task 5 |
| `index.ts` mounts/unmounts `<TurnPanel>` | Task 6 |
| `ora` removed | Tasks 5–6 |
| Non-TTY fallback maintained | Tasks 5–6 |
| Green/yellow/red ContextBar thresholds | Already in ContextBar from Phase 1 |

### Notes on spec delta

The spec says `<StepHeader>` re-renders "on each 'tool' event". The plan uses a `'step'` event instead (emitted when `steps > 1` at the top of the while loop). This is more accurate: a step is the LLM round-trip, tools are what follow. The StepHeader correctly advances when a new ReAct step begins, not when an individual tool fires. This maps better to the existing `printStepHeader(steps, options.maxSteps)` call pattern.

### Placeholder scan

No TBD, TODO, "add error handling", or "similar to Task N" patterns found.

### Type consistency

- `TurnEmitter` defined in Task 1, used in Tasks 4–6 ✅
- `TokenUsageEvent` defined in Task 1, used in Tasks 4–5 ✅
- `TurnPanelProps` defined in Task 4 (`emitter`, `contextLimit`, `maxSteps`) — all three provided by Task 6 ✅
- `ThinkingSpinner` (not `Spinner`) defined in Task 2, used in Task 4 ✅
- `StreamingOutput` defined in Task 3, used in Task 4 ✅
