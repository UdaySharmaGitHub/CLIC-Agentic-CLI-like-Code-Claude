# /export Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/export [format]` slash command that serialises the active CLIC conversation to a file (markdown, json, or html) in the current working directory.

**Architecture:** Single new file `src/commands/export.ts` containing three pure formatter functions (`toMarkdown`, `toJson`, `toHtml`) plus the command shell with a two-step `@clack/prompts` picker (format → scope). Registered in the existing command index alongside the other 14 commands.

**Tech Stack:** TypeScript (ESM), Node.js `fs/promises`, `@clack/prompts` (already a dep), `chalk` (already a dep).

## Global Constraints

- ESM module — use `import`/`export`, no `require()`
- All imports use `.js` extension (e.g. `'../memory.js'`)
- TypeScript strict mode — narrow union types before accessing variant-specific fields
- `@clack/prompts` version already in `package.json` — do not install new deps
- Formatter functions must be exported (named exports) so tests can import them directly
- Test framework: custom runner using `eq()` + `runXxxTests()` pattern (see `test/privacy.test.ts`)

---

### Task 1: Implement `src/commands/export.ts` with formatters + command

**Files:**
- Create: `src/commands/export.ts`
- Create: `test/export.test.ts`
- Modify: `package.json` (add `test:export` script)

**Interfaces:**
- Produces:
  - `export function toMarkdown(messages: ChatMessage[], session: string, model: string): string`
  - `export function toJson(messages: ChatMessage[], session: string, model: string): string`
  - `export function toHtml(messages: ChatMessage[], session: string, model: string): string`
  - `export const command: SlashCommand` (name: `/export`)

---

- [ ] **Step 1: Write the failing test for `toMarkdown`**

Create `test/export.test.ts`:

```typescript
import { pathToFileURL } from 'node:url';
import { toMarkdown, toJson, toHtml } from '../src/commands/export.js';
import type { ChatMessage } from '../src/memory.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

function contains(desc: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected to contain: ${needle}`); }
}

export async function runExportTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nExport Command Tests');

  const msgs: ChatMessage[] = [
    { role: 'system', content: 'You are an assistant.' },
    { role: 'user', content: 'Hello world' },
    {
      role: 'assistant',
      content: 'Hi there!',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"foo.ts"}' } }],
    },
    { role: 'tool', content: 'file contents', tool_call_id: 'tc1' },
  ];

  // ── toMarkdown ──
  const md = toMarkdown(msgs, 'work', 'gpt-4o');
  contains('markdown: includes header', md, '# CLIC Conversation Export');
  contains('markdown: includes session name', md, 'work');
  contains('markdown: includes model', md, 'gpt-4o');
  contains('markdown: includes user message', md, 'Hello world');
  contains('markdown: includes assistant text', md, 'Hi there!');
  contains('markdown: tool call in details block', md, '<details>');
  contains('markdown: tool call shows name', md, 'read_file');
  eq('markdown: skips system messages', md.includes('You are an assistant.'), false);
  eq('markdown: skips tool role messages', md.includes('file contents'), false);

  // ── toJson ──
  const jsonStr = toJson(msgs, 'work', 'gpt-4o');
  const parsed = JSON.parse(jsonStr);
  eq('json: has exportedAt key', typeof parsed.exportedAt, 'string');
  eq('json: session field', parsed.session, 'work');
  eq('json: model field', parsed.model, 'gpt-4o');
  eq('json: messages is array of length 4', parsed.messages.length, 4);
  eq('json: first message is system', parsed.messages[0].role, 'system');

  // ── toHtml ──
  const html = toHtml(msgs, 'work', 'gpt-4o');
  contains('html: starts with DOCTYPE', html, '<!DOCTYPE html>');
  contains('html: includes session in title', html, 'work');
  contains('html: includes user bubble', html, 'Hello world');
  contains('html: includes assistant text', html, 'Hi there!');
  contains('html: tool call in details toggle', html, '<details>');
  contains('html: tool call shows name', html, 'read_file');
  contains('html: no external stylesheets', html, '<style>');
  eq('html: no CDN links', html.includes('cdn.'), false);
  eq('html: skips system messages content', html.includes('You are an assistant.'), false);

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExportTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd "/Project/CLIC-Agentic-CLI-like-Code-Claude"
pnpm tsx test/export.test.ts
```

Expected: error — `Cannot find module '../src/commands/export.js'`

- [ ] **Step 3: Implement `src/commands/export.ts`**

Create the file:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — /export command
//  Serialises the active conversation to markdown, json, or html.
//  Usage: /export [markdown|json|html]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { getMessages, getHistoryFile } from '../memory.js';
import { isEphemeral } from '../privacy.js';
import type { ChatMessage, ToolCall } from '../memory.js';
import type { SlashCommand } from './types.js';

// ── Pure formatters (exported for testing) ──────────────────────────────────

export function toMarkdown(messages: ChatMessage[], session: string, model: string): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    '# CLIC Conversation Export',
    '',
    `- **Session:** ${session}`,
    `- **Model:** ${model}`,
    `- **Exported:** ${now}`,
    `- **Messages:** ${messages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    if (msg.role === 'user') {
      lines.push('## You', '', msg.content, '', '---', '');
    } else if (msg.role === 'assistant') {
      lines.push('## Assistant', '');
      if (msg.content) lines.push(msg.content, '');
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args = tc.function.arguments;
          try { args = JSON.stringify(JSON.parse(args), null, 2); } catch { /* use raw */ }
          lines.push(
            '<details>',
            `<summary>🔧 Tool: ${tc.function.name}</summary>`,
            '',
            '```json',
            args,
            '```',
            '',
            '</details>',
            '',
          );
        }
      }
      lines.push('---', '');
    }
  }

  return lines.join('\n');
}

export function toJson(messages: ChatMessage[], session: string, model: string): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), session, model, messages },
    null,
    2
  );
}

export function toHtml(messages: ChatMessage[], session: string, model: string): string {
  const now = new Date().toISOString();

  function esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;max-width:860px;margin:0 auto}
    .header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:24px}
    .header h1{color:#58a6ff;font-size:18px;margin-bottom:6px}
    .header p{color:#8b949e;font-size:13px;line-height:1.6}
    .message{margin-bottom:14px}
    .badge{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .user .badge{color:#58a6ff}
    .assistant .badge{color:#3fb950}
    .bubble{padding:12px 16px;border-radius:8px;line-height:1.6;font-size:14px;white-space:pre-wrap;word-break:break-word}
    .user .bubble{background:#1f6feb;color:#fff}
    .assistant .bubble{background:#161b22;border:1px solid #30363d}
    details{margin-top:8px}
    summary{cursor:pointer;color:#8b949e;font-size:12px;padding:4px 0;user-select:none}
    summary:hover{color:#c9d1d9}
    pre{background:#010409;border:1px solid #30363d;border-radius:6px;padding:12px;overflow-x:auto;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;margin-top:8px}
  `.trim();

  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    if (msg.role === 'user') {
      parts.push(
        `<div class="message user">`,
        `  <div class="badge">You</div>`,
        `  <div class="bubble">${esc(msg.content)}</div>`,
        `</div>`,
      );
    } else if (msg.role === 'assistant') {
      const textHtml = msg.content ? esc(msg.content) : '';
      const toolHtml = (msg.tool_calls ?? []).map((tc: ToolCall) => {
        let args = tc.function.arguments;
        try { args = JSON.stringify(JSON.parse(args), null, 2); } catch { /* use raw */ }
        return `<details><summary>🔧 Tool: ${esc(tc.function.name)}</summary><pre>${esc(args)}</pre></details>`;
      }).join('\n');
      parts.push(
        `<div class="message assistant">`,
        `  <div class="badge">Assistant</div>`,
        `  <div class="bubble">${textHtml}\n${toolHtml}</div>`,
        `</div>`,
      );
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CLIC Export — ${esc(session)}</title>
<style>${css}</style>
</head>
<body>
<div class="header">
  <h1>CLIC Conversation Export</h1>
  <p>Session: <strong>${esc(session)}</strong> &nbsp;·&nbsp; Model: ${esc(model)} &nbsp;·&nbsp; Exported: ${now} &nbsp;·&nbsp; ${messages.length} messages</p>
</div>
${parts.join('\n')}
</body>
</html>`;
}

// ── Filename collision avoidance ─────────────────────────────────────────────

async function resolveFilename(dir: string, base: string, ext: string): Promise<string> {
  const first = path.join(dir, `${base}.${ext}`);
  try {
    await fs.access(first);
    // File exists — find next available counter
    for (let i = 2; ; i++) {
      const next = path.join(dir, `${base}-${i}.${ext}`);
      try { await fs.access(next); } catch { return next; }
    }
  } catch {
    return first;
  }
}

// ── Command ──────────────────────────────────────────────────────────────────

const VALID_FORMATS = ['markdown', 'json', 'html'] as const;
type Format = typeof VALID_FORMATS[number];

export const command: SlashCommand = {
  name: '/export',
  description: 'Export conversation to a file',
  usage: '/export [markdown|json|html]',
  execute: async (ctx, args) => {
    // Step 1: resolve format
    let format: Format;
    if (args && (VALID_FORMATS as readonly string[]).includes(args)) {
      format = args as Format;
    } else {
      const picked = await select({
        message: 'Export format:',
        options: [
          { value: 'markdown', label: 'Markdown', hint: 'Human-readable .md file' },
          { value: 'json',     label: 'JSON',     hint: 'Raw message array with metadata' },
          { value: 'html',     label: 'HTML',     hint: 'Self-contained styled page' },
        ],
      });
      if (isCancel(picked)) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }
      format = picked as Format;
    }

    // Step 2: resolve scope
    let messages: ChatMessage[];
    const ephemeral = isEphemeral();

    if (ephemeral) {
      console.log(chalk.dim('  Running in privacy mode — exporting current window only.'));
      messages = getMessages();
    } else {
      const scopeOptions = [
        { value: 'window', label: 'Current window', hint: `${getMessages().length} messages in memory` },
        { value: 'full',   label: 'Full history',   hint: 'Load complete history from disk' },
      ];
      const pickedScope = await select({ message: 'Export scope:', options: scopeOptions });
      if (isCancel(pickedScope)) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }

      if (pickedScope === 'full') {
        try {
          const raw = await fs.readFile(getHistoryFile(), 'utf-8');
          messages = JSON.parse(raw) as ChatMessage[];
        } catch (err) {
          console.log(chalk.yellow(`  ⚠️  Could not read history file — falling back to current window. (${(err as Error).message})`));
          messages = getMessages();
        }
      } else {
        messages = getMessages();
      }
    }

    // Step 3: build content
    const session = ctx.sessionName ?? 'default';
    const extMap: Record<Format, string> = { markdown: 'md', json: 'json', html: 'html' };
    const dateStr = new Date().toISOString().slice(0, 10);
    const base = `clic-export-${dateStr}`;
    const filePath = await resolveFilename(process.cwd(), base, extMap[format]);

    let content: string;
    if (format === 'markdown')   content = toMarkdown(messages, session, ctx.model);
    else if (format === 'json')  content = toJson(messages, session, ctx.model);
    else                         content = toHtml(messages, session, ctx.model);

    try {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(chalk.green(`  ✅ Exported to ${filePath}`));
    } catch (err) {
      console.log(chalk.red(`  ✗ Export failed: ${(err as Error).message}`));
    }

    console.log();
    return { type: 'continue' };
  },
};
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm tsx test/export.test.ts
```

Expected: all assertions pass, `0 failed`.

- [ ] **Step 5: Add `test:export` script to `package.json`**

In `package.json`, inside the `"scripts"` block, add after `"test:privacy"`:

```json
"test:export": "tsx test/export.test.ts"
```

- [ ] **Step 6: Run `test:export` via pnpm to confirm it works**

```bash
pnpm test:export
```

Expected: all pass, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/commands/export.ts test/export.test.ts package.json
git commit -m "feat: add /export command with markdown, json, and html formatters"
```

---

### Task 2: Register the command + wire up test suite

**Files:**
- Modify: `src/commands/index.ts` (import + register)
- Modify: `test/index.ts` (add to test suite runner)

**Interfaces:**
- Consumes: `export const command: SlashCommand` from `./export.js` (produced by Task 1)

---

- [ ] **Step 1: Register `exportCmd` in `src/commands/index.ts`**

Add the import after the existing imports (line 24, after `privacyCmd`):

```typescript
import { command as exportCmd } from './export.js';
```

Add `exportCmd` to the `commands` array after `privacyCmd`:

```typescript
const commands: SlashCommand[] = [
  exitCmd,
  clearCmd,
  historyCmd,
  statusCmd,
  helpCmd,
  rawCmd,
  compactCmd,
  modelCmd,
  undoCmd,
  retryCmd,
  tokensCmd,
  roleCmd,
  sessionCmd,
  privacyCmd,
  exportCmd,   // ← add this line
];
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
pnpm build
```

Expected: no TypeScript errors, `dist/` rebuilt successfully.

- [ ] **Step 3: Add export tests to the main test suite runner**

`test/index.ts` has a fixed-arity `printSummary` — every new suite requires four edits. Make all four:

**Edit 1** — add import at line 14 (after `runPrivacyTests` import):
```typescript
import { runExportTests } from './export.test.js';
```

**Edit 2** — add `exportResult` parameter to `printSummary` signature (after `privacy`):
```typescript
function printSummary(
  validationGate: { passed: number; failed: number },
  toolSchemas: { passed: number; failed: number },
  edgeCases: { passed: number; failed: number },
  watcher: { passed: number; failed: number },
  privacy: { passed: number; failed: number },
  exportResult: { passed: number; failed: number },
) {
  const totalPassed = validationGate.passed + toolSchemas.passed + edgeCases.passed + watcher.passed + privacy.passed + exportResult.passed;
  const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed + privacy.failed + exportResult.failed;
```

**Edit 3** — add a row in the summary table (after the Privacy row):
```
║  Export Command Tests         : ${exportResult.passed.toString().padEnd(2)} passed, ${exportResult.failed.toString().padEnd(2)} failed                ║
```

**Edit 4** — in `runAllTests()`, call the suite and pass result to `printSummary`:
```typescript
const privacy = await runPrivacyTests();
const exportResult = await runExportTests();

printSummary(validationGate, toolSchemas, edgeCases, watcher, privacy, exportResult);

const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed + privacy.failed + exportResult.failed;
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass including the new export suite.

- [ ] **Step 5: Smoke-test manually**

```bash
pnpm dev
```

At the REPL prompt, type `/export` and verify:
1. Format picker appears with arrow-key selection
2. After selecting `markdown`, scope picker appears
3. After selecting `current window`, file `clic-export-<date>.md` is created in CWD
4. File contents include a header and the conversation messages
5. Try `/export json` — should skip format picker, go straight to scope
6. Check `/help` — `/export` appears in the command list

- [ ] **Step 6: Commit**

```bash
git add src/commands/index.ts test/index.ts
git commit -m "feat: register /export command and add to test suite"
```
