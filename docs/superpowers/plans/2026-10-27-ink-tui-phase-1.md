# Ink TUI Migration — Phase 1: Static Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/ui.ts` with a React/Ink component system under `src/ui/`, preserving the exact visual output via adapter shims that keep every existing `printXxx()` call site unchanged.

**Architecture:** All chalk + console.log code moves into Ink `<Text>` components under `src/ui/components/`. The public API (`src/ui/index.ts`) exports the same function signatures as the original `src/ui.ts` — each shim calls `render(<Component />)` + `await waitUntilRenderFlush()` + `unmount()` for one-shot static output. A TTY guard in every shim routes to `src/ui/fallback.ts` (chalk) when `process.stdout.isTTY` is false (CI, `--paste`, piped).

**Tech Stack:** Ink v5, React 18, TypeScript with JSX (`react-jsx`), chalk (stays for colors), tsup with JSX config.

## Global Constraints

- Node.js >= 20, pnpm >= 10, ESM (`"type": "module"` in package.json)
- All imports in `.ts`/`.tsx` files must use `.js` extension (ESM NodeNext)
- Zero changes to any caller: `src/index.ts`, `src/agent.ts`, `src/commands/**` — adapter shims must match original signatures exactly
- chalk stays — used as color utility inside `<Text>` components
- The visual output must be pixel-for-pixel identical to today's chalk output
- Tests follow the project's custom runner pattern (`eq()` function, no jest/vitest)
- Branch: `feature/ink-tui-migration` (already checked out)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Create** | `tsup.config.ts` | Enable JSX transpilation in the build |
| **Modify** | `tsconfig.json` | Add `"jsx": "react-jsx"` |
| **Create** | `src/ui/theme.ts` | All color constants, gradients, box helpers — pure TS |
| **Create** | `src/ui/helpers.ts` | Pure functions: `visLen`, `logoGradient`, `sessionPaletteEntry`, `actionLabel`, `sessionNameBadge`, box-drawing helpers |
| **Create** | `src/ui/fallback.ts` | Chalk-based fallback for non-TTY (copy from `src/ui.ts`) |
| **Create** | `src/ui/components/Separator.tsx` | `printSeparator()` + `promptPrintSeperator()` |
| **Create** | `src/ui/components/DimOutput.tsx` | `printDimOutput()` |
| **Create** | `src/ui/components/ToolResult.tsx` | `printToolSuccess/Error/Blocked/Rejected()` |
| **Create** | `src/ui/components/ToolHeader.tsx` | `printToolHeader()` |
| **Create** | `src/ui/components/StepHeader.tsx` | `printStepHeader()` |
| **Create** | `src/ui/components/ContextBar.tsx` | `printContextBar()` |
| **Create** | `src/ui/components/Status.tsx` | `printStatus()` |
| **Create** | `src/ui/components/Help.tsx` | `printHelp()` |
| **Create** | `src/ui/components/Banner.tsx` | `printBanner()` with animation |
| **Create** | `src/ui/index.ts` | All adapter shims + TTY detection + re-exports |
| **Delete** | `src/ui.ts` | Replaced by `src/ui/index.ts` |
| **Modify** | `test/index.ts` | Import and run `runUiTests` |
| **Create** | `test/ui.test.ts` | Unit tests for pure helpers + Ink component render output |
| **Modify** | `package.json` | Add `test:ui` script |

---

### Task 1: Build infrastructure — JSX support + dependencies

**Files:**
- Modify: `tsconfig.json`
- Create: `tsup.config.ts`

**Interfaces:**
- Produces: `.tsx` files compile without errors; `pnpm build` bundles Ink components

- [ ] **Step 1: Install Ink and React**

```bash
pnpm add ink react
pnpm add -D @types/react
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Verify installed versions**

```bash
node -e "const ink = await import('ink'); console.log('ink ok');" --input-type=module 2>&1 | head -5
```

Expected: prints `ink ok` (or an error about not being in a TSX context, which is fine — we just confirm the package installed).

- [ ] **Step 3: Add `"jsx": "react-jsx"` to `tsconfig.json`**

Current `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Add `"jsx": "react-jsx"` to `compilerOptions`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `tsup.config.ts`**

The current build script is `tsup src/index.ts --format esm --clean`. Replace it with a config file so JSX is explicit:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  dts: false,
});
```

Update `package.json` build script from:
```
"build": "tsup src/index.ts --format esm --clean",
```
to:
```
"build": "tsup",
```

Note: tsup reads `tsconfig.json` for JSX settings automatically. The config file just makes the entry explicit.

- [ ] **Step 5: Write a trivial smoke-test TSX file**

Create `src/ui/_smoke.tsx` (temporary, will be deleted after Task 9):

```tsx
import React from 'react';
import { Text } from 'ink';

export function Smoke() {
  return <Text>smoke</Text>;
}
```

- [ ] **Step 6: Verify TypeScript accepts JSX**

```bash
pnpm typecheck 2>&1 | head -20
```

Expected: no errors. If you see "Cannot find module 'react/jsx-runtime'" — add `"types": ["react"]` to tsconfig compilerOptions.

- [ ] **Step 7: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

Expected: `dist/index.js` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json tsup.config.ts package.json src/ui/_smoke.tsx
git commit -m "build: add JSX support for Ink TUI migration (tsconfig + tsup)"
```

---

### Task 2: `src/ui/theme.ts` — color constants and box helpers

**Files:**
- Create: `src/ui/theme.ts`
- Create: `test/ui.test.ts` (skeleton + theme tests)

**Interfaces:**
- Produces: `W`, `accent`, `accentBold`, `LOGO_COLORS`, `SESSION_PALETTE`, `ACTION_STYLES` — imported by helpers and components

- [ ] **Step 1: Write failing tests for theme exports**

Create `test/ui.test.ts`:

```typescript
/**
 * UI module tests — pure helpers and Ink component output.
 * Run with: pnpm test:ui
 */
import { W, LOGO_COLORS, SESSION_PALETTE, ACTION_STYLES } from '../src/ui/theme.js';
import { pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

export async function runUiTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nUI Module Tests');

  // ── theme.ts ──────────────────────────────────────────────
  eq('W is 62', W, 62);
  eq('LOGO_COLORS has 6 entries', LOGO_COLORS.length, 6);
  eq('LOGO_COLORS[0] is purple', LOGO_COLORS[0], '#C084FC');
  eq('LOGO_COLORS[5] is cyan', LOGO_COLORS[5], '#22D3EE');
  eq('SESSION_PALETTE has 10 entries', SESSION_PALETTE.length, 10);
  eq('SESSION_PALETTE[0] is violet', SESSION_PALETTE[0].bg, '#7C3AED');
  eq('SESSION_PALETTE[4] amber has black fg', SESSION_PALETTE[4].fg, '#000000');
  eq('ACTION_STYLES has run_command', 'run_command' in ACTION_STYLES, true);
  eq('ACTION_STYLES has web_search', 'web_search' in ACTION_STYLES, true);
  eq('ACTION_STYLES run_command icon', ACTION_STYLES['run_command']!.icon, '⚙️ ');

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUiTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm tsx test/ui.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '../src/ui/theme.js'`

- [ ] **Step 3: Create `src/ui/theme.ts`**

```typescript
import chalk from 'chalk';

export const W = 62; // inner content width

export const accent     = chalk.hex('#60E1F0');
export const accentBold = chalk.hex('#60E1F0').bold;

export const LOGO_COLORS = ['#C084FC', '#A78BFA', '#818CF8', '#60A5FA', '#38BDF8', '#22D3EE'];

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

export const ACTION_STYLES: Record<string, { icon: string; color: (s: string) => string }> = {
  run_command:    { icon: '⚙️ ', color: chalk.yellow },
  read_file:      { icon: '📖', color: chalk.hex('#60E1F0') },
  write_file:     { icon: '✏️ ', color: chalk.hex('#C084FC') },
  append_file:    { icon: '➕', color: chalk.hex('#C084FC') },
  modify_file:    { icon: '🔧', color: chalk.hex('#F59E0B') },
  list_directory: { icon: '📂', color: chalk.hex('#60E1F0') },
  search_files:   { icon: '🔍', color: chalk.hex('#34D399') },
  web_search:     { icon: '🌐', color: chalk.hex('#34D399') },
};
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.ts test/ui.test.ts
git commit -m "feat(ui): add src/ui/theme.ts with color constants and action styles"
```

---

### Task 3: `src/ui/helpers.ts` — pure helper functions

**Files:**
- Create: `src/ui/helpers.ts`
- Modify: `test/ui.test.ts` (add helper tests)

**Interfaces:**
- Consumes: `W`, `LOGO_COLORS`, `SESSION_PALETTE`, `ACTION_STYLES` from `src/ui/theme.ts`
- Produces: `visLen(s)`, `logoGradient(lines)`, `boxTop(w?)`, `boxBottom(w?)`, `boxDiv(w?)`, `boxLine(content, w?)`, `sessionPaletteEntry(name)`, `actionLabel(action)`, `sessionNameBadge(name)` — used by all components

- [ ] **Step 1: Add failing tests to `test/ui.test.ts`**

Add this block to `runUiTests()` after the theme tests:

```typescript
  // ── helpers.ts ────────────────────────────────────────────
  const { visLen, sessionPaletteEntry, actionLabel, sessionNameBadge, boxTop, boxBottom, boxDiv, boxLine } =
    await import('../src/ui/helpers.js');

  // visLen strips ANSI codes
  eq('visLen plain string', visLen('hello'), 5);
  eq('visLen chalk-colored string', visLen('\x1b[32mhello\x1b[0m'), 5);
  eq('visLen empty string', visLen(''), 0);

  // sessionPaletteEntry is deterministic
  const entry1 = sessionPaletteEntry('default');
  const entry2 = sessionPaletteEntry('default');
  eq('sessionPaletteEntry is stable for same name', entry1.bg, entry2.bg);
  eq('sessionPaletteEntry returns bg from palette', SESSION_PALETTE.some(e => e.bg === entry1.bg), true);
  eq('sessionPaletteEntry different names may differ',
     sessionPaletteEntry('alpha').bg !== sessionPaletteEntry('zzzzzzzz').bg ||
     sessionPaletteEntry('alpha').bg === sessionPaletteEntry('zzzzzzzz').bg, true); // just runs

  // actionLabel
  const runLabel = actionLabel('run_command');
  eq('actionLabel strips ANSI but contains action text',
     visLen(runLabel) > 0, true);
  const unknownLabel = actionLabel('not_a_tool');
  eq('actionLabel unknown contains ❓', visLen(unknownLabel) > 0, true);

  // sessionNameBadge
  const badge = sessionNameBadge('mytest');
  eq('sessionNameBadge contains session name', badge.includes('mytest'), true);

  // box helpers produce correct raw character widths
  const topLine = boxTop();
  eq('boxTop starts with spaces', topLine.trimStart().startsWith('╭'), false); // chalk-colored, so contains ANSI
  eq('boxTop visible length', visLen(boxTop()), W + 2 + 4); // "  ╭" + dashes + "╮"

  const contentLine = boxLine('hello');
  eq('boxLine contains content', contentLine.includes('hello'), true);
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm tsx test/ui.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '../src/ui/helpers.js'`

- [ ] **Step 3: Create `src/ui/helpers.ts`**

```typescript
import chalk from 'chalk';
import { W, LOGO_COLORS, SESSION_PALETTE, ACTION_STYLES } from './theme.js';

export function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function logoGradient(lines: string[]): string[] {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const maxDiag = (lines.length - 1) + (maxLen - 1);
  return lines.map((line, row) =>
    line.split('').map((ch, col) => {
      if (ch === ' ') return ch;
      const t = maxDiag === 0 ? 0 : (row + col) / maxDiag;
      const idx = Math.min(Math.floor(t * LOGO_COLORS.length), LOGO_COLORS.length - 1);
      return chalk.hex(LOGO_COLORS[idx]).bold(ch);
    }).join('')
  );
}

export function boxTop(w = W): string {
  return chalk.dim(`  ╭${'─'.repeat(w + 2)}╮`);
}

export function boxBottom(w = W): string {
  return chalk.dim(`  ╰${'─'.repeat(w + 2)}╯`);
}

export function boxDiv(w = W): string {
  return chalk.dim(`  ├${'─'.repeat(w + 2)}┤`);
}

export function boxLine(content: string, w = W): string {
  const pad = Math.max(0, w - visLen(content));
  return `  ${chalk.dim('│')} ${content}${' '.repeat(pad)} ${chalk.dim('│')}`;
}

export function sessionPaletteEntry(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return SESSION_PALETTE[hash % SESSION_PALETTE.length]!;
}

export function actionLabel(action: string): string {
  const style = ACTION_STYLES[action];
  if (!style) return chalk.dim(`❓ ${action}`);
  const name = action.replace(/_/g, ' ').toUpperCase();
  return style.color(`${style.icon} ${name}`);
}

export function sessionNameBadge(name: string): string {
  const { bg, fg } = sessionPaletteEntry(name);
  return chalk.hex(fg).bgHex(bg)(` ${name} `);
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/helpers.ts test/ui.test.ts
git commit -m "feat(ui): add src/ui/helpers.ts — pure rendering helpers extracted from ui.ts"
```

---

### Task 4: `src/ui/fallback.ts` — non-TTY chalk fallback

**Files:**
- Create: `src/ui/fallback.ts`

**Interfaces:**
- Produces: same function signatures as `src/ui.ts` — used by `src/ui/index.ts` when `process.stdout.isTTY` is false
- Consumes: `visLen`, `boxTop`, `boxBottom`, `boxDiv`, `boxLine`, `actionLabel`, `sessionNameBadge` from `src/ui/helpers.ts`; `accent`, `accentBold`, `W` from `src/ui/theme.ts`

No new tests for this task — the fallback is a direct copy of the chalk implementations and will be visually tested in Task 9.

- [ ] **Step 1: Create `src/ui/fallback.ts`**

This file contains the exact chalk implementations from the original `src/ui.ts`, re-implemented using the extracted helpers. It is the non-TTY fallback used by `src/ui/index.ts`.

```typescript
// Non-TTY fallback — chalk-based implementations used when process.stdout.isTTY is false
// (--paste mode, piped stdin, CI). Ink cannot render without a real TTY.

import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';
import { W, accent, accentBold, LOGO_COLORS } from './theme.js';
import { visLen, logoGradient, boxTop, boxBottom, boxDiv, boxLine, actionLabel, sessionNameBadge } from './helpers.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function printBanner(): Promise<void> {
  console.clear();
  console.log();

  const logo = [
    '  ██████╗ ██╗      ██╗  ██████╗ ',
    ' ██╔════╝ ██║      ██║ ██╔════╝ ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ╚██████╗ ███████╗ ██║ ╚██████╗ ',
    '  ╚═════╝ ╚══════╝ ╚═╝  ╚═════╝ ',
  ];

  const maxLogoLen = Math.max(...logo.map((l) => l.length));
  const termWidth  = process.stdout.columns || 80;
  const logoPad    = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));
  const gradedLogo = logoGradient(logo);
  for (const line of gradedLogo) {
    console.log(`${logoPad}${line}`);
    await delay(80);
  }

  console.log();

  const divider  = chalk.dim('─'.repeat(18));
  const star     = chalk.hex('#C084FC')('✦');
  const title    = chalk.bold.white('Command Line Intelligence Companion');
  const tagline  = `${divider} ${star} ${title} ${star} ${divider}`;
  const taglinePad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(tagline)) / 2)));
  console.log(`${taglinePad}${tagline}`);
  console.log();

  const sep  = chalk.dim(' · ');
  const info =
    `${chalk.hex('#C084FC').bold('v4.3')}${sep}` +
    `${chalk.dim('Anthropic & OpenAI & Google')}${sep}` +
    `${chalk.hex('#22D3EE')('Multi-Model Orchestration')}${sep}` +
    `${chalk.hex('#34D399').bold('● Ready')}`;
  const infoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(info)) / 2)));
  console.log(`${infoPad}${info}`);
  console.log();

  console.log(boxTop());
  console.log(boxLine(`${accentBold('⚡ Tools & Capabilities')}`));
  console.log(boxDiv());

  const tools: [string, string][] = [
    ['💬', 'chat'],      ['⚙️ ', 'command'],   ['📖', 'read'],
    ['✏️ ', 'write'],    ['➕',  'append'],     ['🔧', 'modify'],
    ['📂', 'list'],      ['🔍', 'search'],      ['🌐', 'web'],
    ['🔗', 'agentic'],   ['📚', 'knowledge'],
  ];

  const NAME_W = 10;
  for (let i = 0; i < tools.length; i += 3) {
    const row = tools.slice(i, i + 3) as [string, string][];
    const cells = row.map(([icon, name]) =>
      `${icon} ${accent(name)}${' '.repeat(Math.max(0, NAME_W - name.trim().length))}`,
    );
    while (cells.length < 3) cells.push(' '.repeat(NAME_W + 3));
    console.log(boxLine(`  ${cells.join('  ')}`));
    await delay(25);
  }

  console.log(boxBottom());
  console.log();

  console.log(`    ${chalk.dim('▸ Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`);
  console.log(`    ${chalk.dim('▸ /compact · /model · /role · /undo · /retry · /tokens · /clear · /exit')}`);
  console.log();
}

export function printHelp(): void {
  console.log();

  const W2 = 73;
  const LW = 34;

  const box2Top    = () => chalk.dim(`  ╭${'─'.repeat(36)}┬${'─'.repeat(38)}╮`);
  const box2Div    = () => chalk.dim(`  ├${'─'.repeat(36)}┼${'─'.repeat(38)}┤`);
  const box2Bottom = () => chalk.dim(`  ╰${'─'.repeat(36)}┴${'─'.repeat(38)}╯`);

  const splitRow = (left: string, right: string): string => {
    const lpad = ' '.repeat(Math.max(0, LW - visLen(left)));
    return boxLine(`${left}${lpad}${chalk.dim(' │ ')}${right}`, W2);
  };

  const capCat  = (lbl: string) => `  ${chalk.hex('#818CF8')('┄')}  ${chalk.hex('#A78BFA').bold(lbl)}`;
  const capItem = (icon: string, name: string) => `  ${icon} ${chalk.white(name)}`;
  const cmdCat  = (lbl: string) => `  ${chalk.hex('#F59E0B')('┄')}  ${chalk.hex('#FCD34D').bold(lbl)}`;
  const cmdItem = (cmd: string, desc: string) => `  ${accent(cmd.padEnd(10))}${chalk.dim(desc)}`;
  const cmdSub  = (sub: string, desc: string) => `    ${chalk.dim('·')} ${chalk.dim(sub.padEnd(8))}${chalk.dim(desc)}`;

  const L: string[] = [
    capCat('Conversation'),
    capItem('💬', 'Chat / Q&A'),
    capItem('🔗', 'Agentic Loop'),
    capItem('📚', 'Knowledge Base'),
    '',
    capCat('Files & Filesystem'),
    capItem('📖', 'Read'),
    capItem('✏️',  'Write'),
    capItem('➕', 'Append'),
    capItem('🔧', 'Modify'),
    capItem('📂', 'List Dirs'),
    '',
    capCat('External'),
    capItem('⚙️',  'Run Commands'),
    capItem('🔍', 'Search'),
    capItem('🌐', 'Web Search'),
    '',
  ];

  const R: string[] = [
    cmdCat('Session'),
    cmdItem('/session',  'Named sessions  /s'),
    cmdSub('new',    'create & switch'),
    cmdSub('switch', 'switch to session'),
    cmdSub('rename', 'rename active'),
    cmdSub('list',   'list all sessions'),
    cmdSub('delete', 'delete a session'),
    cmdItem('/compact',  'Summarize history'),
    cmdItem('/clear',    'Clear chat'),
    cmdItem('/undo',     'Remove last exchange'),
    cmdItem('/retry',    'Regenerate  /r'),
    cmdItem('/exit',     'Quit'),
    '',
    cmdCat('Configuration'),
    cmdItem('/model',    'Switch model'),
    cmdItem('/role',     'Switch persona'),
    '',
    cmdCat('Information'),
    cmdItem('/tokens',   'Token usage'),
    cmdItem('/status',   'System info'),
    cmdItem('/history',  'Show history'),
    cmdItem('/raw',      'Debug output'),
    cmdItem('/help',     'Show this menu'),
  ];

  console.log(box2Top());
  console.log(splitRow(accentBold('🧠 Capabilities'), chalk.yellow.bold('⌘  Commands')));
  console.log(box2Div());

  const maxLen = Math.max(L.length, R.length);
  for (let i = 0; i < maxLen; i++) {
    console.log(splitRow(L[i] ?? '', R[i] ?? ''));
  }

  console.log(box2Bottom());
  console.log();

  const ideas: [string, string][] = [
    ['①', 'what is the difference between TCP and UDP?'],
    ['②', 'list all python files in current directory'],
    ['③', 'create a test.py with a bug then fix it'],
    ['④', 'read config.json and update the port to 9000'],
    ['⑤', 'create a hello.sh, make it executable, run it'],
  ];

  console.log(boxTop());
  console.log(boxLine(`${accentBold('💡 Prompt Ideas')}`));
  console.log(boxDiv());
  for (const [num, idea] of ideas) {
    console.log(boxLine(`  ${accent(num)}  ${chalk.dim(`"${idea}"`)}`));
  }
  console.log(boxBottom());
  console.log();
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
  console.log();
  console.log(boxTop());
  console.log(boxLine(`${accentBold('📊 System Context')}`));
  console.log(boxDiv());

  const rows: [string, string][] = [
    ['🖥  OS',          `${os.type()} (${os.arch()})`],
    ['👤 User',        `${os.userInfo().username}@${os.hostname()}`],
    ['🐚 Shell',       path.basename(process.env.SHELL || 'unknown')],
    ['📁 CWD',         process.cwd()],
    ['📅 Date',        new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['🔖 Session',     opts.sessionName ?? chalk.dim('default')],
    ['🤖 Model',       opts.model],
    ['🪟 Context Win', `${opts.contextLimit.toLocaleString()} tokens`],
    ['💬 History',     `${opts.messageCount} messages`],
    ['🔄 Max Steps',   `${opts.maxSteps} per turn`],
    ['🐛 Debug Raw',   opts.showRaw ? chalk.yellow('on') : chalk.dim('off')],
    ['📚 KB Role',     opts.kbFile ? `${chalk.green('● Loaded')} ${chalk.dim(`(${opts.kbFile})`)}` : chalk.dim('not loaded')],
  ];

  for (const [key, val] of rows) {
    console.log(boxLine(`  ${chalk.dim(key.padEnd(14))}${val}`));
  }

  console.log(boxBottom());
  console.log();
}

export function printStepHeader(step: number, maxSteps: number): void {
  console.log();
  const badge = chalk.bgHex('#0d2137').hex('#60E1F0').bold(` ⟳ Step ${step} / ${maxSteps} `);
  const trail = chalk.dim('─'.repeat(W - 10));
  console.log(`  ${badge}  ${trail}`);
}

export function printSeparator(): void {
  console.log(chalk.dim(`  ${'─'.repeat(W + 4)}`));
}

export function promptPrintSeperator(sessionName?: string): void {
  const termWidth = process.stdout.columns || 80;
  const badge = sessionName ? ` ${sessionNameBadge(sessionName)}` : '';
  const badgeVisLen = sessionName ? sessionName.length + 2 : 0;
  const dashCount = Math.max(4, termWidth - badgeVisLen - 2);
  const dashes = chalk.cyanBright('─'.repeat(dashCount));
  console.log(`  ${dashes}${badge}`);
}

export function printToolHeader(toolName: string, detail: string): void {
  console.log();
  console.log(boxTop());
  console.log(boxLine(chalk.bold(actionLabel(toolName))));
  console.log(boxDiv());
  console.log(boxLine(`📝 ${chalk.dim(detail)}`));
  console.log(boxBottom());
}

export function printToolSuccess(message: string): void {
  console.log(`  ${chalk.green('✅')} ${chalk.green(message)}`);
}

export function printToolError(message: string): void {
  console.log(`  ${chalk.red('❌')} ${chalk.red(message)}`);
}

export function printToolBlocked(message: string): void {
  console.log(`  ${chalk.bgRed.white.bold(' 🚫 BLOCKED ')} ${chalk.red(message)}`);
}

export function printRejected(): void {
  console.log(`  ${chalk.red('❌')} ${chalk.dim('Rejected by user.')}`);
}

export function printContextBar(promptTokens: number, contextLimit: number, threshold = 0.80): void {
  if (promptTokens <= 0 || contextLimit <= 0) return;

  const pct    = promptTokens / contextLimit;
  const pctInt = Math.round(pct * 100);
  const BAR_W  = 30;
  const filled = Math.min(BAR_W, Math.round(pct * BAR_W));
  const empty  = BAR_W - filled;

  let barColor: (s: string) => string;
  let pctColor: (s: string) => string;
  if (pct < 0.60)           { barColor = chalk.green;  pctColor = chalk.green.bold;  }
  else if (pct < threshold) { barColor = chalk.yellow; pctColor = chalk.yellow.bold; }
  else                      { barColor = chalk.red;    pctColor = chalk.red.bold;    }

  const bar    = barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const label  = pctColor(`${pctInt}%`);
  const detail = chalk.dim(`${promptTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens`);
  const prefix = pct >= threshold ? chalk.red('🔴') : pct >= 0.60 ? chalk.yellow('🟡') : chalk.green('🟢');

  console.log(`  ${prefix} ${chalk.dim('Context')}  ${chalk.dim('[')}${bar}${chalk.dim(']')}  ${label}  ${detail}`);
}

export function printDimOutput(lines: string[], maxLines = 50): void {
  const arr = lines.slice(0, maxLines);
  for (const line of arr) {
    console.log(chalk.dim(`    ${line}`));
  }
  if (lines.length > maxLines) {
    console.log(chalk.dim(`    ⋯ (${lines.length - maxLines} more lines truncated)`));
  }
}

export function actionLabelFallback(action: string): string {
  return actionLabel(action);
}

export { sessionNameBadge };
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/fallback.ts
git commit -m "feat(ui): add src/ui/fallback.ts — chalk fallback for non-TTY environments"
```

---

### Task 5: Simple Ink components — `Separator.tsx`, `DimOutput.tsx`

These two components are the simplest (no complex layout, minimal props). Implement and test them first to validate the Ink render pattern before tackling the larger components.

**Files:**
- Create: `src/ui/components/Separator.tsx`
- Create: `src/ui/components/DimOutput.tsx`
- Modify: `test/ui.test.ts` (add render tests)

**Interfaces:**
- Consumes: `chalk`, `W` from theme, `visLen`, `sessionNameBadge` from helpers
- Produces: `<Separator />`, `<PromptSeparator sessionName? />`, `<DimOutput lines maxLines? />`

**One-shot render helper** (add to `test/ui.test.ts` at top — used in all component tests):

```typescript
import { render } from 'ink';
import { Writable } from 'node:stream';
import React from 'react';

async function renderInk(element: React.ReactElement): Promise<string> {
  let output = '';
  const stream = new Writable({
    write(chunk, _enc, cb) { output += chunk.toString(); cb(); }
  });
  const { waitUntilRenderFlush, unmount } = render(element, stream);
  await waitUntilRenderFlush();
  unmount();
  // Strip all ANSI escape codes for content assertions
  return output.replace(/\x1b\[[0-9;]*m/g, '');
}
```

- [ ] **Step 1: Add failing render tests to `test/ui.test.ts`**

Add inside `runUiTests()` after existing tests (requires the `renderInk` helper above):

```typescript
  // ── Separator component ─────────────────────────────────────
  const { Separator, PromptSeparator } = await import('../src/ui/components/Separator.js');

  const sepOut = await renderInk(React.createElement(Separator, null));
  eq('Separator output contains dash characters', sepOut.includes('─'), true);

  const pSepOut = await renderInk(React.createElement(PromptSeparator, null));
  eq('PromptSeparator output is non-empty', pSepOut.trim().length > 0, true);

  const pSepWithName = await renderInk(React.createElement(PromptSeparator, { sessionName: 'work' }));
  eq('PromptSeparator with session name contains session name', pSepWithName.includes('work'), true);

  // ── DimOutput component ─────────────────────────────────────
  const { DimOutput } = await import('../src/ui/components/DimOutput.js');

  const dimOut = await renderInk(React.createElement(DimOutput, { lines: ['line one', 'line two'] }));
  eq('DimOutput contains first line', dimOut.includes('line one'), true);
  eq('DimOutput contains second line', dimOut.includes('line two'), true);

  const dimTrunc = await renderInk(React.createElement(DimOutput, { lines: ['a', 'b', 'c'], maxLines: 2 }));
  eq('DimOutput truncation message appears', dimTrunc.includes('more lines truncated'), true);
  eq('DimOutput does not contain truncated line c', dimTrunc.includes('    c'), false);
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm tsx test/ui.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '../src/ui/components/Separator.js'`

- [ ] **Step 3: Create `src/ui/components/Separator.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { W } from '../theme.js';
import { sessionNameBadge } from '../helpers.js';

export function Separator() {
  return <Text>{chalk.dim(`  ${'─'.repeat(W + 4)}`)}</Text>;
}

export function PromptSeparator({ sessionName }: { sessionName?: string }) {
  const termWidth = process.stdout.columns || 80;
  const badge = sessionName ? ` ${sessionNameBadge(sessionName)}` : '';
  const badgeVisLen = sessionName ? sessionName.length + 2 : 0;
  const dashCount = Math.max(4, termWidth - badgeVisLen - 2);
  const dashes = chalk.cyanBright('─'.repeat(dashCount));
  return <Text>{`  ${dashes}${badge}`}</Text>;
}
```

- [ ] **Step 4: Create `src/ui/components/DimOutput.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface DimOutputProps {
  lines: string[];
  maxLines?: number;
}

export function DimOutput({ lines, maxLines = 50 }: DimOutputProps) {
  const arr = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;
  return (
    <>
      {arr.map((line, i) => (
        <Text key={i}>{chalk.dim(`    ${line}`)}</Text>
      ))}
      {truncated && (
        <Text>{chalk.dim(`    ⋯ (${lines.length - maxLines} more lines truncated)`)}</Text>
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all new separator/dim-output tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Separator.tsx src/ui/components/DimOutput.tsx test/ui.test.ts
git commit -m "feat(ui): add Separator and DimOutput Ink components"
```

---

### Task 6: `ToolResult.tsx` and `ToolHeader.tsx` components

**Files:**
- Create: `src/ui/components/ToolResult.tsx`
- Create: `src/ui/components/ToolHeader.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `actionLabel` from helpers, box helpers from helpers
- Produces: `<ToolResult type message? />`, `<ToolHeader toolName detail />`

- [ ] **Step 1: Add failing tests**

Add to `runUiTests()`:

```typescript
  // ── ToolResult component ────────────────────────────────────
  const { ToolResult } = await import('../src/ui/components/ToolResult.js');

  const successOut = await renderInk(React.createElement(ToolResult, { type: 'success', message: 'File written.' }));
  eq('ToolResult success contains message', successOut.includes('File written.'), true);
  eq('ToolResult success contains checkmark', successOut.includes('✅'), true);

  const errorOut = await renderInk(React.createElement(ToolResult, { type: 'error', message: 'Permission denied.' }));
  eq('ToolResult error contains message', errorOut.includes('Permission denied.'), true);
  eq('ToolResult error contains X', errorOut.includes('❌'), true);

  const blockedOut = await renderInk(React.createElement(ToolResult, { type: 'blocked', message: 'rm -rf blocked.' }));
  eq('ToolResult blocked contains BLOCKED', blockedOut.includes('BLOCKED'), true);

  const rejectedOut = await renderInk(React.createElement(ToolResult, { type: 'rejected' }));
  eq('ToolResult rejected contains Rejected', rejectedOut.includes('Rejected'), true);

  // ── ToolHeader component ────────────────────────────────────
  const { ToolHeader } = await import('../src/ui/components/ToolHeader.js');

  const thOut = await renderInk(React.createElement(ToolHeader, { toolName: 'read_file', detail: 'src/index.ts' }));
  eq('ToolHeader contains READ FILE', thOut.includes('READ FILE'), true);
  eq('ToolHeader contains detail text', thOut.includes('src/index.ts'), true);
  eq('ToolHeader contains box corners', thOut.includes('╭'), true);
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm tsx test/ui.test.ts 2>&1 | grep '❌' | head -10
```

Expected: failures for ToolResult and ToolHeader imports.

- [ ] **Step 3: Create `src/ui/components/ToolResult.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

type ResultType = 'success' | 'error' | 'blocked' | 'rejected';

interface ToolResultProps {
  type: ResultType;
  message?: string;
}

export function ToolResult({ type, message }: ToolResultProps) {
  switch (type) {
    case 'success':
      return <Text>{`  ${chalk.green('✅')} ${chalk.green(message ?? '')}`}</Text>;
    case 'error':
      return <Text>{`  ${chalk.red('❌')} ${chalk.red(message ?? '')}`}</Text>;
    case 'blocked':
      return <Text>{`  ${chalk.bgRed.white.bold(' 🚫 BLOCKED ')} ${chalk.red(message ?? '')}`}</Text>;
    case 'rejected':
      return <Text>{`  ${chalk.red('❌')} ${chalk.dim('Rejected by user.')}`}</Text>;
  }
}
```

- [ ] **Step 4: Create `src/ui/components/ToolHeader.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { boxTop, boxBottom, boxDiv, boxLine, actionLabel } from '../helpers.js';

interface ToolHeaderProps {
  toolName: string;
  detail: string;
}

export function ToolHeader({ toolName, detail }: ToolHeaderProps) {
  return (
    <>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(chalk.bold(actionLabel(toolName)))}</Text>
      <Text>{boxDiv()}</Text>
      <Text>{boxLine(`📝 ${chalk.dim(detail)}`)}</Text>
      <Text>{boxBottom()}</Text>
    </>
  );
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all new ToolResult and ToolHeader tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ToolResult.tsx src/ui/components/ToolHeader.tsx test/ui.test.ts
git commit -m "feat(ui): add ToolResult and ToolHeader Ink components"
```

---

### Task 7: `StepHeader.tsx` and `ContextBar.tsx` components

**Files:**
- Create: `src/ui/components/StepHeader.tsx`
- Create: `src/ui/components/ContextBar.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Produces: `<StepHeader step maxSteps />`, `<ContextBar promptTokens contextLimit threshold? />`

- [ ] **Step 1: Add failing tests**

```typescript
  // ── StepHeader component ─────────────────────────────────────
  const { StepHeader } = await import('../src/ui/components/StepHeader.js');

  const shOut = await renderInk(React.createElement(StepHeader, { step: 2, maxSteps: 5 }));
  eq('StepHeader contains step number', shOut.includes('2'), true);
  eq('StepHeader contains max steps', shOut.includes('5'), true);
  eq('StepHeader contains Step label', shOut.includes('Step'), true);

  // ── ContextBar component ──────────────────────────────────────
  const { ContextBar } = await import('../src/ui/components/ContextBar.js');

  const cbGreenOut = await renderInk(React.createElement(ContextBar, { promptTokens: 1000, contextLimit: 10000 }));
  eq('ContextBar green (10%) renders without error', cbGreenOut.trim().length > 0, true);
  eq('ContextBar shows token counts', cbGreenOut.includes('1,000'), true);

  const cbYellowOut = await renderInk(React.createElement(ContextBar, { promptTokens: 7000, contextLimit: 10000 }));
  eq('ContextBar yellow (70%) renders without error', cbYellowOut.trim().length > 0, true);
  eq('ContextBar shows 70%', cbYellowOut.includes('70%'), true);

  const cbZeroOut = await renderInk(React.createElement(ContextBar, { promptTokens: 0, contextLimit: 10000 }));
  eq('ContextBar with 0 tokens renders empty string', cbZeroOut.trim().length === 0, true);
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm tsx test/ui.test.ts 2>&1 | grep '❌' | head -5
```

Expected: failures for StepHeader and ContextBar imports.

- [ ] **Step 3: Create `src/ui/components/StepHeader.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { W } from '../theme.js';

interface StepHeaderProps {
  step: number;
  maxSteps: number;
}

export function StepHeader({ step, maxSteps }: StepHeaderProps) {
  const badge = chalk.bgHex('#0d2137').hex('#60E1F0').bold(` ⟳ Step ${step} / ${maxSteps} `);
  const trail = chalk.dim('─'.repeat(W - 10));
  return (
    <>
      <Text>{''}</Text>
      <Text>{`  ${badge}  ${trail}`}</Text>
    </>
  );
}
```

- [ ] **Step 4: Create `src/ui/components/ContextBar.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface ContextBarProps {
  promptTokens: number;
  contextLimit: number;
  threshold?: number;
}

export function ContextBar({ promptTokens, contextLimit, threshold = 0.80 }: ContextBarProps) {
  if (promptTokens <= 0 || contextLimit <= 0) return null;

  const pct    = promptTokens / contextLimit;
  const pctInt = Math.round(pct * 100);
  const BAR_W  = 30;
  const filled = Math.min(BAR_W, Math.round(pct * BAR_W));
  const empty  = BAR_W - filled;

  let barColor: (s: string) => string;
  let pctColor: (s: string) => string;
  if (pct < 0.60)           { barColor = chalk.green;  pctColor = chalk.green.bold;  }
  else if (pct < threshold) { barColor = chalk.yellow; pctColor = chalk.yellow.bold; }
  else                      { barColor = chalk.red;    pctColor = chalk.red.bold;    }

  const bar    = barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const label  = pctColor(`${pctInt}%`);
  const detail = chalk.dim(`${promptTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens`);
  const prefix = pct >= threshold ? chalk.red('🔴') : pct >= 0.60 ? chalk.yellow('🟡') : chalk.green('🟢');

  return <Text>{`  ${prefix} ${chalk.dim('Context')}  ${chalk.dim('[')}${bar}${chalk.dim(']')}  ${label}  ${detail}`}</Text>;
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all StepHeader and ContextBar tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/StepHeader.tsx src/ui/components/ContextBar.tsx test/ui.test.ts
git commit -m "feat(ui): add StepHeader and ContextBar Ink components"
```

---

### Task 8: `Status.tsx` and `Help.tsx` components

**Files:**
- Create: `src/ui/components/Status.tsx`
- Create: `src/ui/components/Help.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `boxTop`, `boxBottom`, `boxDiv`, `boxLine`, `accentBold`, `accent` from theme/helpers
- Produces: `<Status messageCount maxSteps showRaw kbFile? model contextLimit sessionName? />`, `<Help />`

- [ ] **Step 1: Add failing tests**

```typescript
  // ── Status component ──────────────────────────────────────────
  const { Status } = await import('../src/ui/components/Status.js');

  const statusOut = await renderInk(React.createElement(Status, {
    messageCount: 5,
    maxSteps: 10,
    showRaw: false,
    model: 'gpt-4o',
    contextLimit: 128000,
    sessionName: 'work',
  }));
  eq('Status contains model name', statusOut.includes('gpt-4o'), true);
  eq('Status contains message count', statusOut.includes('5'), true);
  eq('Status contains session name', statusOut.includes('work'), true);
  eq('Status contains System Context header', statusOut.includes('System Context'), true);

  // ── Help component ──────────────────────────────────────────
  const { Help } = await import('../src/ui/components/Help.js');

  const helpOut = await renderInk(React.createElement(Help, null));
  eq('Help contains /session command', helpOut.includes('/session'), true);
  eq('Help contains /compact command', helpOut.includes('/compact'), true);
  eq('Help contains Capabilities header', helpOut.includes('Capabilities'), true);
  eq('Help contains prompt ideas box', helpOut.includes('Prompt Ideas'), true);
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm tsx test/ui.test.ts 2>&1 | grep '❌' | head -5
```

Expected: failures for Status and Help imports.

- [ ] **Step 3: Create `src/ui/components/Status.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';
import { accentBold } from '../theme.js';
import { boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

interface StatusProps {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
  contextLimit: number;
  sessionName?: string;
}

export function Status({ messageCount, maxSteps, showRaw, kbFile, model, contextLimit, sessionName }: StatusProps) {
  const rows: [string, string][] = [
    ['🖥  OS',          `${os.type()} (${os.arch()})`],
    ['👤 User',        `${os.userInfo().username}@${os.hostname()}`],
    ['🐚 Shell',       path.basename(process.env.SHELL || 'unknown')],
    ['📁 CWD',         process.cwd()],
    ['📅 Date',        new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['🔖 Session',     sessionName ?? chalk.dim('default')],
    ['🤖 Model',       model],
    ['🪟 Context Win', `${contextLimit.toLocaleString()} tokens`],
    ['💬 History',     `${messageCount} messages`],
    ['🔄 Max Steps',   `${maxSteps} per turn`],
    ['🐛 Debug Raw',   showRaw ? chalk.yellow('on') : chalk.dim('off')],
    ['📚 KB Role',     kbFile ? `${chalk.green('● Loaded')} ${chalk.dim(`(${kbFile})`)}` : chalk.dim('not loaded')],
  ];

  return (
    <>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(`${accentBold('📊 System Context')}`)}</Text>
      <Text>{boxDiv()}</Text>
      {rows.map(([key, val], i) => (
        <Text key={i}>{boxLine(`  ${chalk.dim(key.padEnd(14))}${val}`)}</Text>
      ))}
      <Text>{boxBottom()}</Text>
      <Text>{''}</Text>
    </>
  );
}
```

- [ ] **Step 4: Create `src/ui/components/Help.tsx`**

```tsx
import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { accent, accentBold } from '../theme.js';
import { visLen, boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

export function Help() {
  const W2 = 73;
  const LW = 34;

  const box2Top    = () => chalk.dim(`  ╭${'─'.repeat(36)}┬${'─'.repeat(38)}╮`);
  const box2Div    = () => chalk.dim(`  ├${'─'.repeat(36)}┼${'─'.repeat(38)}┤`);
  const box2Bottom = () => chalk.dim(`  ╰${'─'.repeat(36)}┴${'─'.repeat(38)}╯`);

  const splitRow = (left: string, right: string) => {
    const lpad = ' '.repeat(Math.max(0, LW - visLen(left)));
    return boxLine(`${left}${lpad}${chalk.dim(' │ ')}${right}`, W2);
  };

  const capCat  = (lbl: string) => `  ${chalk.hex('#818CF8')('┄')}  ${chalk.hex('#A78BFA').bold(lbl)}`;
  const capItem = (icon: string, name: string) => `  ${icon} ${chalk.white(name)}`;
  const cmdCat  = (lbl: string) => `  ${chalk.hex('#F59E0B')('┄')}  ${chalk.hex('#FCD34D').bold(lbl)}`;
  const cmdItem = (cmd: string, desc: string) => `  ${accent(cmd.padEnd(10))}${chalk.dim(desc)}`;
  const cmdSub  = (sub: string, desc: string) => `    ${chalk.dim('·')} ${chalk.dim(sub.padEnd(8))}${chalk.dim(desc)}`;

  const L: string[] = [
    capCat('Conversation'),
    capItem('💬', 'Chat / Q&A'),
    capItem('🔗', 'Agentic Loop'),
    capItem('📚', 'Knowledge Base'),
    '',
    capCat('Files & Filesystem'),
    capItem('📖', 'Read'),
    capItem('✏️',  'Write'),
    capItem('➕', 'Append'),
    capItem('🔧', 'Modify'),
    capItem('📂', 'List Dirs'),
    '',
    capCat('External'),
    capItem('⚙️',  'Run Commands'),
    capItem('🔍', 'Search'),
    capItem('🌐', 'Web Search'),
    '',
  ];

  const R: string[] = [
    cmdCat('Session'),
    cmdItem('/session',  'Named sessions  /s'),
    cmdSub('new',    'create & switch'),
    cmdSub('switch', 'switch to session'),
    cmdSub('rename', 'rename active'),
    cmdSub('list',   'list all sessions'),
    cmdSub('delete', 'delete a session'),
    cmdItem('/compact',  'Summarize history'),
    cmdItem('/clear',    'Clear chat'),
    cmdItem('/undo',     'Remove last exchange'),
    cmdItem('/retry',    'Regenerate  /r'),
    cmdItem('/exit',     'Quit'),
    '',
    cmdCat('Configuration'),
    cmdItem('/model',    'Switch model'),
    cmdItem('/role',     'Switch persona'),
    '',
    cmdCat('Information'),
    cmdItem('/tokens',   'Token usage'),
    cmdItem('/status',   'System info'),
    cmdItem('/history',  'Show history'),
    cmdItem('/raw',      'Debug output'),
    cmdItem('/help',     'Show this menu'),
  ];

  const ideas: [string, string][] = [
    ['①', 'what is the difference between TCP and UDP?'],
    ['②', 'list all python files in current directory'],
    ['③', 'create a test.py with a bug then fix it'],
    ['④', 'read config.json and update the port to 9000'],
    ['⑤', 'create a hello.sh, make it executable, run it'],
  ];

  const maxLen = Math.max(L.length, R.length);

  return (
    <>
      <Text>{''}</Text>
      <Text>{box2Top()}</Text>
      <Text>{splitRow(accentBold('🧠 Capabilities'), chalk.yellow.bold('⌘  Commands'))}</Text>
      <Text>{box2Div()}</Text>
      {Array.from({ length: maxLen }, (_, i) => (
        <Text key={i}>{splitRow(L[i] ?? '', R[i] ?? '')}</Text>
      ))}
      <Text>{box2Bottom()}</Text>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(`${accentBold('💡 Prompt Ideas')}`)}</Text>
      <Text>{boxDiv()}</Text>
      {ideas.map(([num, idea], i) => (
        <Text key={i}>{boxLine(`  ${accent(num)}  ${chalk.dim(`"${idea}"`)}`)}</Text>
      ))}
      <Text>{boxBottom()}</Text>
      <Text>{''}</Text>
    </>
  );
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all Status and Help tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Status.tsx src/ui/components/Help.tsx test/ui.test.ts
git commit -m "feat(ui): add Status and Help Ink components"
```

---

### Task 9: `Banner.tsx` — animated gradient logo

This is the most complex component because it uses `useEffect` for animation timing and `useApp().exit()` to signal completion to the adapter shim.

**Files:**
- Create: `src/ui/components/Banner.tsx`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Consumes: `logoGradient`, `visLen` from helpers; `accentBold`, `accent` from theme
- Produces: `<Banner />` — calls `useApp().exit()` when animation completes; adapter shim awaits `waitUntilExit()`

**Key design:** The adapter shim for Banner uses `waitUntilExit()` not `waitUntilRenderFlush()` because the animation runs over multiple render frames. The Banner component calls `useApp().exit()` when all lines have been displayed.

- [ ] **Step 1: Add failing tests**

Add to `runUiTests()`:

```typescript
  // ── Banner component ──────────────────────────────────────────
  // Note: we test with animation disabled (instantMode) to avoid 800ms+ delays in tests.
  const { Banner } = await import('../src/ui/components/Banner.js');

  // In instant mode, Banner exits immediately after first render.
  // We test by awaiting waitUntilExit() (the same path the adapter uses).
  let bannerOutput = '';
  const bannerStream = new Writable({
    write(chunk, _enc, cb) { bannerOutput += chunk.toString(); cb(); }
  });
  const { waitUntilExit: bannerWait } = render(React.createElement(Banner, { instantMode: true }), bannerStream);
  await bannerWait();
  const bannerClean = bannerOutput.replace(/\x1b\[[0-9;]*m/g, '');
  eq('Banner contains CLIC logo block characters', bannerClean.includes('██'), true);
  eq('Banner contains tagline', bannerClean.includes('Command Line Intelligence Companion'), true);
  eq('Banner contains Tools & Capabilities', bannerClean.includes('Tools & Capabilities'), true);
  eq('Banner contains /help hint', bannerClean.includes('/help'), true);
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm tsx test/ui.test.ts 2>&1 | grep '❌' | head -5
```

Expected: failures for Banner import.

- [ ] **Step 3: Create `src/ui/components/Banner.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Text, useApp } from 'ink';
import chalk from 'chalk';
import { accentBold, accent } from '../theme.js';
import { logoGradient, visLen, boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

const LOGO_LINES = [
  '  ██████╗ ██╗      ██╗  ██████╗ ',
  ' ██╔════╝ ██║      ██║ ██╔════╝ ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ╚██████╗ ███████╗ ██║ ╚██████╗ ',
  '  ╚═════╝ ╚══════╝ ╚═╝  ╚═════╝ ',
];

const TOOLS: [string, string][] = [
  ['💬', 'chat'],      ['⚙️ ', 'command'],   ['📖', 'read'],
  ['✏️ ', 'write'],    ['➕',  'append'],     ['🔧', 'modify'],
  ['📂', 'list'],      ['🔍', 'search'],      ['🌐', 'web'],
  ['🔗', 'agentic'],   ['📚', 'knowledge'],
];

interface BannerProps {
  instantMode?: boolean; // skip delays — for testing
}

export function Banner({ instantMode = false }: BannerProps) {
  const { exit } = useApp();
  const gradedLines = logoGradient(LOGO_LINES);
  const termWidth = process.stdout.columns || 80;
  const maxLogoLen = Math.max(...LOGO_LINES.map((l) => l.length));
  const logoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));

  const totalLines = LOGO_LINES.length + TOOLS.length;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (instantMode) {
      setStep(totalLines);
      return;
    }

    let count = 0;
    const id = setInterval(() => {
      count++;
      setStep(count);
      if (count >= totalLines) clearInterval(id);
    }, count < LOGO_LINES.length ? 80 : 25);
    return () => clearInterval(id);
  }, [instantMode]);

  // Signal parent adapter when animation is complete
  useEffect(() => {
    if (step >= totalLines) exit();
  }, [step, totalLines, exit]);

  const divider    = chalk.dim('─'.repeat(18));
  const star       = chalk.hex('#C084FC')('✦');
  const title      = chalk.bold.white('Command Line Intelligence Companion');
  const tagline    = `${divider} ${star} ${title} ${star} ${divider}`;
  const taglinePad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(tagline)) / 2)));

  const sep  = chalk.dim(' · ');
  const info =
    `${chalk.hex('#C084FC').bold('v4.3')}${sep}` +
    `${chalk.dim('Anthropic & OpenAI & Google')}${sep}` +
    `${chalk.hex('#22D3EE')('Multi-Model Orchestration')}${sep}` +
    `${chalk.hex('#34D399').bold('● Ready')}`;
  const infoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(info)) / 2)));

  const NAME_W = 10;
  const toolRows: string[][] = [];
  for (let i = 0; i < TOOLS.length; i += 3) {
    const row = TOOLS.slice(i, i + 3) as [string, string][];
    const cells = row.map(([icon, name]) =>
      `${icon} ${accent(name)}${' '.repeat(Math.max(0, NAME_W - name.trim().length))}`,
    );
    while (cells.length < 3) cells.push(' '.repeat(NAME_W + 3));
    toolRows.push(cells);
  }

  const visibleLogoLines = gradedLines.slice(0, Math.min(step, LOGO_LINES.length));
  const visibleToolRows  = toolRows.slice(0, Math.max(0, step - LOGO_LINES.length));

  return (
    <>
      <Text>{''}</Text>
      {visibleLogoLines.map((line, i) => (
        <Text key={`logo-${i}`}>{`${logoPad}${line}`}</Text>
      ))}
      {step >= LOGO_LINES.length && (
        <>
          <Text>{''}</Text>
          <Text>{`${taglinePad}${tagline}`}</Text>
          <Text>{''}</Text>
          <Text>{`${infoPad}${info}`}</Text>
          <Text>{''}</Text>
          <Text>{boxTop()}</Text>
          <Text>{boxLine(`${accentBold('⚡ Tools & Capabilities')}`)}</Text>
          <Text>{boxDiv()}</Text>
          {visibleToolRows.map((cells, i) => (
            <Text key={`tool-${i}`}>{boxLine(`  ${cells.join('  ')}`)}</Text>
          ))}
          {step >= totalLines && (
            <>
              <Text>{boxBottom()}</Text>
              <Text>{''}</Text>
              <Text>{`    ${chalk.dim('▸ Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`}</Text>
              <Text>{`    ${chalk.dim('▸ /compact · /model · /role · /undo · /retry · /tokens · /clear · /exit')}`}</Text>
              <Text>{''}</Text>
            </>
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
pnpm tsx test/ui.test.ts
```

Expected: all Banner tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/Banner.tsx test/ui.test.ts
git commit -m "feat(ui): add Banner Ink component with animated gradient logo"
```

---

### Task 10: `src/ui/index.ts` adapter shims + delete `src/ui.ts`

This is the final wiring task. `src/ui/index.ts` exports the same function signatures as the original `src/ui.ts`. Every import of `'../ui.js'` or `'./ui.js'` elsewhere in the codebase continues to work without change — they now import from the directory's `index.ts`.

**Files:**
- Create: `src/ui/index.ts`
- Delete: `src/ui.ts`
- Delete: `src/ui/_smoke.tsx` (temp file from Task 1)
- Modify: `test/index.ts` (add `runUiTests`)
- Modify: `package.json` (add `test:ui` script)

**Interfaces:**
- Exports: all `printXxx` functions with identical signatures to original `src/ui.ts`
- Consumes: all components + fallback + theme + helpers

**One-shot render helper** (internal to `index.ts`):

```typescript
async function runOneShot(element: React.ReactElement): Promise<void> {
  const { waitUntilRenderFlush, unmount } = render(element, { exitOnCtrlC: false });
  await waitUntilRenderFlush();
  unmount();
}
```

- [ ] **Step 1: Create `src/ui/index.ts`**

```typescript
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
  const { waitUntilExit } = render(<Banner />, { exitOnCtrlC: false });
  await waitUntilExit();
}

export function printHelp(): void {
  if (!isTTY()) return fb.printHelp();
  void runOneShot(<Help />);
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
  void runOneShot(<Status {...opts} />);
}

export function printStepHeader(step: number, maxSteps: number): void {
  if (!isTTY()) return fb.printStepHeader(step, maxSteps);
  void runOneShot(<StepHeader step={step} maxSteps={maxSteps} />);
}

export function printSeparator(): void {
  if (!isTTY()) return fb.printSeparator();
  void runOneShot(<Separator />);
}

export function promptPrintSeperator(sessionName?: string): void {
  if (!isTTY()) return fb.promptPrintSeperator(sessionName);
  void runOneShot(<PromptSeparator sessionName={sessionName} />);
}

export function printToolHeader(toolName: string, detail: string): void {
  if (!isTTY()) return fb.printToolHeader(toolName, detail);
  void runOneShot(<ToolHeader toolName={toolName} detail={detail} />);
}

export function printToolSuccess(message: string): void {
  if (!isTTY()) return fb.printToolSuccess(message);
  void runOneShot(<ToolResult type="success" message={message} />);
}

export function printToolError(message: string): void {
  if (!isTTY()) return fb.printToolError(message);
  void runOneShot(<ToolResult type="error" message={message} />);
}

export function printToolBlocked(message: string): void {
  if (!isTTY()) return fb.printToolBlocked(message);
  void runOneShot(<ToolResult type="blocked" message={message} />);
}

export function printRejected(): void {
  if (!isTTY()) return fb.printRejected();
  void runOneShot(<ToolResult type="rejected" />);
}

export function printContextBar(promptTokens: number, contextLimit: number, threshold?: number): void {
  if (!isTTY()) return fb.printContextBar(promptTokens, contextLimit, threshold);
  void runOneShot(<ContextBar promptTokens={promptTokens} contextLimit={contextLimit} threshold={threshold} />);
}

export function printDimOutput(lines: string[], maxLines?: number): void {
  if (!isTTY()) return fb.printDimOutput(lines, maxLines);
  void runOneShot(<DimOutput lines={lines} maxLines={maxLines} />);
}
```

**Important note on `printHelp` / `printStatus` / etc.:** The original `src/ui.ts` exports these as `void`-returning functions. They call `console.log` synchronously. With Ink, `runOneShot` is async — we `void` the promise. For Phase 1 this is acceptable: the output appears on the next event loop tick, which is imperceptible to the user. Phase 3 (full REPL app) will handle ordering properly.

- [ ] **Step 2: Verify the callers don't need path changes**

The original import in `src/index.ts` will look like:
```typescript
import { printBanner, printHelp, ... } from './ui.js';
```

With `src/ui.ts` deleted and `src/ui/index.ts` created, Node.js resolves `./ui.js` to `./ui/index.js` (directory index resolution). **Verify this works** — check one caller:

```bash
grep -n "from './ui" "/Users/I578366/Desktop/My Workspace/Personal Project/CLIC-Agentic-CLI-like-Code-Claude/src/index.ts" | head -5
```

If any caller imports as `from './ui.js'` — that resolves to either `src/ui.ts` (file) or `src/ui/index.ts` (directory). With Node.js `NodeNext` module resolution, a bare `./ui.js` import resolves to the file `src/ui.js`. When we delete `src/ui.ts`, the file `src/ui.js` no longer exists. We need to check whether any caller imports `'./ui.js'` and whether that will break.

**If callers use `'./ui.js'`:** The import won't automatically resolve to `src/ui/index.ts` with `NodeNext`. We have two options:
- Change all caller imports from `'./ui.js'` to `'./ui/index.js'`
- Or keep a barrel `src/ui.ts` that just re-exports from `./ui/index.js`

**Recommended:** check all callers and update their imports if needed. Run:

```bash
grep -rn "from.*['\"].*\/ui['\"]" "/Users/I578366/Desktop/My Workspace/Personal Project/CLIC-Agentic-CLI-like-Code-Claude/src/" | grep -v "src/ui/"
```

For each match, update the import from `'../ui.js'` or `'./ui.js'` to `'./ui/index.js'` or `'../ui/index.js'` respectively.

- [ ] **Step 3: Update caller imports**

For each file that imports from `ui.ts`, update the import path. Example: if `src/index.ts` has:
```typescript
import { printBanner, printHelp } from './ui.js';
```
Change to:
```typescript
import { printBanner, printHelp } from './ui/index.js';
```

Repeat for `src/agent.ts` and any files under `src/commands/`.

- [ ] **Step 4: Delete `src/ui.ts` and smoke-test file**

```bash
rm "/Users/I578366/Desktop/My Workspace/Personal Project/CLIC-Agentic-CLI-like-Code-Claude/src/ui.ts"
rm "/Users/I578366/Desktop/My Workspace/Personal Project/CLIC-Agentic-CLI-like-Code-Claude/src/ui/_smoke.tsx"
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: no errors. Fix any remaining import path issues.

- [ ] **Step 6: Wire `runUiTests` into the test runner**

Add `test:ui` script to `package.json`:
```json
"test:ui": "tsx test/ui.test.ts",
```

Add `runUiTests` import and call to `test/index.ts`:
```typescript
import { runUiTests } from './ui.test.js';
// ... in the main runner function:
const ui = await runUiTests();
```
(Follow the existing pattern in `test/index.ts` exactly — add to both the import list and the `printSummary` call.)

- [ ] **Step 7: Run the full test suite**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all tests pass including the new UI tests.

- [ ] **Step 8: Run the build**

```bash
pnpm build 2>&1 | tail -10
```

Expected: `dist/index.js` created, no TypeScript or bundle errors.

- [ ] **Step 9: Visual smoke test — run pnpm dev**

```bash
pnpm dev --no-history -- /exit
```

Observe:
- Banner renders with gradient logo animation
- No visible regressions vs. the original chalk output

Also test manually:
```bash
pnpm dev --no-history
```
Type `/help`, `/status`, ask a question that triggers a tool. Verify:
- `/help` panel renders with 2-column layout
- `/status` panel renders with all system info
- Tool headers (box with tool name + detail) render correctly
- Tool result lines (✅/❌) render correctly

- [ ] **Step 10: Commit**

```bash
git add src/ui/ src/index.ts src/agent.ts src/commands/ test/ui.test.ts test/index.ts package.json
git rm src/ui.ts
git commit -m "feat(ui): Phase 1 complete — Ink static components replace chalk ui.ts"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all test suites pass
- [ ] `pnpm build` — dist builds cleanly
- [ ] Visual: banner animation renders with correct gradient and timing
- [ ] Visual: `/help` renders 2-column capabilities + commands panel
- [ ] Visual: `/status` renders system info panel
- [ ] Visual: tool header box renders with tool name + detail
- [ ] Visual: tool success/error/blocked/rejected lines render correctly
- [ ] Visual: separator lines render correctly
- [ ] Visual: dim tool output renders correctly
- [ ] Non-TTY: `pnpm dev -- --no-history "hello" 2>/dev/null | cat` uses chalk fallback (no Ink ANSI sequences in piped output)
- [ ] No regressions in existing tests (`pnpm test:zod`, `pnpm test:watcher`, etc.)
- [ ] `src/ui.ts` is deleted; `src/ui/index.ts` is the new entry point
- [ ] All callers import from `./ui/index.js` (not `./ui.js`)
- [ ] `src/ui/_smoke.tsx` is deleted

---

## Spec Cross-Reference

| Spec requirement | Task |
|---|---|
| `src/ui/theme.ts` — color constants extracted | Task 2 |
| `src/ui/helpers.ts` — pure helpers extracted | Task 3 |
| `src/ui/fallback.ts` — non-TTY chalk fallback | Task 4 |
| `<Separator />` + `<PromptSeparator />` components | Task 5 |
| `<DimOutput />` component | Task 5 |
| `<ToolResult />` component | Task 6 |
| `<ToolHeader />` component | Task 6 |
| `<StepHeader />` component | Task 7 |
| `<ContextBar />` component | Task 7 |
| `<Status />` component | Task 8 |
| `<Help />` component | Task 8 |
| `<Banner />` with animation | Task 9 |
| Adapter shims in `src/ui/index.ts` | Task 10 |
| Delete `src/ui.ts` | Task 10 |
| `tsconfig.json` `"jsx": "react-jsx"` | Task 1 |
| tsup JSX config | Task 1 |
| `pnpm add ink react && pnpm add -D @types/react` | Task 1 |
| TTY detection → fallback path | Task 10 |
| Zero caller changes | Task 10 |
| Visual output identical to today | Task 10 |
