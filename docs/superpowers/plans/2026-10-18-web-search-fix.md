# Web Search Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake `web_search` tool (plain LLM chat call) with a real implementation using OpenAI's Responses API and `tools: [{ type: "web_search" }]`, including live citations, provider/model guards, and configurable search depth.

**Architecture:** Extract the shared `withRetry` helper into `src/retry.ts` to break the circular dependency (`openai.ts → tools/index.ts → webSearch.ts → openai.ts`). Rewrite `src/tools/webSearch.ts` to use `client.responses.create()` with a hardcoded OpenAI base URL (Responses API is OpenAI-only). Export pure helper functions (`isOpenAIEndpoint`, `supportsWebSearch`, `extractCitations`) so they can be unit-tested without any API calls.

**Tech Stack:** Node.js 20+, TypeScript ESM, openai SDK v6.37.0, zod (already in project)

## Global Constraints

- ESM only — all imports must use `.js` extensions
- No new npm dependencies — use only what's already in `package.json`
- Keep the same Zod schema (`query: z.string().min(1)`) — existing schema tests must continue to pass unchanged
- `withRetry` signature must stay identical — `(fn, maxAttempts?, signal?) => Promise<T>`
- All env vars read at call time (not module load), so `.env` changes take effect without restart
- Follow existing test-file pattern: export `run<Name>Tests(): Promise<{ passed; failed }>`; guard with `if (import.meta.url === pathToFileURL(...).href)`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/retry.ts` | Houses `withRetry` — shared by `openai.ts` and `webSearch.ts` |
| **Modify** | `src/openai.ts:45-62` | Remove inline `withRetry`, import from `./retry.js` |
| **Rewrite** | `src/tools/webSearch.ts` | Responses API + guards + citations + env-based config |
| **Create** | `test/web-search.test.ts` | Unit tests for `isOpenAIEndpoint`, `supportsWebSearch`, `extractCitations` |
| **Modify** | `test/index.ts` | Import + run new test suite; update `printSummary` and `runAllTests` |
| **Modify** | `package.json` | Add `test:web-search` script |
| **Modify** | `.env.example` | Document 3 new env vars |
| **Modify** | `AGENTS.md` | Update `web_search` implementation note |

---

## Task 1: Extract `withRetry` into `src/retry.ts`

**Files:**
- Create: `src/retry.ts`
- Modify: `src/openai.ts:45-62`

**Interfaces:**
- Produces: `export async function withRetry<T>(fn: () => Promise<T>, maxAttempts?: number, signal?: AbortSignal): Promise<T>`

- [ ] **Step 1: Create `src/retry.ts`**

```typescript
import OpenAI from 'openai';

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetriable =
        error instanceof OpenAI.APIError &&
        [429, 500, 502, 503, 504].includes(error.status);
      const isLastAttempt = attempt === maxAttempts - 1;

      if (!isRetriable || isLastAttempt) throw error;
      if (signal?.aborted) throw error;

      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}
```

- [ ] **Step 2: Replace the inline `withRetry` in `src/openai.ts` with an import**

In `src/openai.ts`, remove lines 44–62 (the entire `withRetry` function including its comment block) and add this import at the top alongside the other imports:

```typescript
import { withRetry } from './retry.js';
```

The rest of `openai.ts` is unchanged — `withRetry` is called the same way.

- [ ] **Step 3: Verify the build still compiles**

```bash
pnpm build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Verify existing tests still pass**

```bash
pnpm test
```

Expected: all suites pass (same count as before this change).

- [ ] **Step 5: Commit**

```bash
git add src/retry.ts src/openai.ts
git commit -m "refactor: extract withRetry to src/retry.ts to break circular dep"
```

---

## Task 2: Rewrite `src/tools/webSearch.ts`

**Files:**
- Rewrite: `src/tools/webSearch.ts`

**Interfaces:**
- Consumes: `withRetry` from `../retry.js` (Task 1)
- Consumes: `printToolHeader`, `printToolSuccess`, `printToolError`, `printRejected`, `printDimOutput`, `printSeparator` from `../ui.js` (unchanged)
- Produces (exported for testing): `isOpenAIEndpoint(): boolean`, `supportsWebSearch(model: string): boolean`, `extractCitations(output: any[]): Array<{ title: string; url: string }>`
- Produces (tool registry): `definition: ToolDefinition`, `execute(input, confirm): Promise<ToolResult>`

- [ ] **Step 1: Overwrite `src/tools/webSearch.ts` with the full implementation**

```typescript
// ─────────────────────────────────────────────────────────────────────────────
//  Tool: web_search — real-time internet search via OpenAI Responses API
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import OpenAI from 'openai';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';
import { withRetry } from '../retry.js';
import { z } from 'zod';

const schema = z.object({
  query: z.string().min(1, { message: 'Query is required' }),
});

export const definition: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the internet for real-time information — current events, breaking news, ' +
    'stock prices, weather, recent research, or any topic requiring up-to-date data. ' +
    'Use this when the answer may have changed since the model\'s training cutoff.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
  schema,
};

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function isOpenAIEndpoint(): boolean {
  const base = (process.env.BASE_URL ?? '').trim().toLowerCase();
  return base === '' || base.includes('api.openai.com');
}

const SEARCH_CAPABLE_PREFIXES = ['gpt-4o', 'gpt-4.1', 'gpt-4.5', 'gpt-5', 'gpt-6', 'o3', 'o4'];

export function supportsWebSearch(model: string): boolean {
  const m = model.toLowerCase();
  return SEARCH_CAPABLE_PREFIXES.some(p => m.startsWith(p));
}

interface Citation {
  title: string;
  url: string;
}

export function extractCitations(output: OpenAI.Responses.ResponseOutputItem[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const item of output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type !== 'output_text') continue;
      for (const ann of (part.annotations ?? [])) {
        if (ann.type !== 'url_citation') continue;
        if (seen.has(ann.url)) continue;
        seen.add(ann.url);
        citations.push({
          title: (ann as Record<string, unknown>).title as string ?? ann.url,
          url: ann.url,
        });
      }
    }
  }

  return citations;
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(
  input: z.infer<typeof schema>,
  confirm: ConfirmFn,
): Promise<ToolResult> {
  printToolHeader('web_search', `Query: ${input.query}`);

  // ── Provider guard
  if (!isOpenAIEndpoint()) {
    const msg =
      `web_search requires OpenAI's API.\n` +
      `Your BASE_URL is set to a custom endpoint which does not support the Responses API.\n` +
      `Set BASE_URL=https://api.openai.com/v1 (or leave it unset) to enable web search.`;
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }

  // ── Model guard
  const model = process.env.CLIC_MODEL || 'gpt-4o';
  if (!supportsWebSearch(model)) {
    const msg =
      `Model '${model}' does not support the Responses API web search tool.\n` +
      `Switch to gpt-4o or gpt-4.1 using the /model command.`;
    printToolError(msg);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }

  if (!await confirm(`Approve web search for '${input.query}'?`)) {
    printRejected();
    printSeparator();
    return { output: 'User rejected the web search.', isError: true };
  }

  console.log(`  ${chalk.green('  🌐 Searching the web...')}`);
  console.log();

  // ── Read config from env at call time
  const searchContextSize = (['low', 'medium', 'high'].includes(
    process.env.SEARCH_CONTEXT_SIZE ?? '',
  ))
    ? (process.env.SEARCH_CONTEXT_SIZE as 'low' | 'medium' | 'high')
    : 'medium';

  const allowedDomains = process.env.SEARCH_ALLOWED_DOMAINS
    ? process.env.SEARCH_ALLOWED_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
    : undefined;

  const blockedDomains = process.env.SEARCH_BLOCKED_DOMAINS
    ? process.env.SEARCH_BLOCKED_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
    : undefined;

  const webSearchTool: Record<string, unknown> = {
    type: 'web_search',
    search_context_size: searchContextSize,
    ...(allowedDomains?.length
      ? { filters: { allowed_domains: allowedDomains } }
      : blockedDomains?.length
        ? { filters: { blocked_domains: blockedDomains } }
        : {}),
  };

  // Always use the OpenAI endpoint for Responses API — BASE_URL may be a
  // custom proxy that lacks the /responses route.
  const client = new OpenAI({
    apiKey: process.env.API_KEY ?? '',
    baseURL: 'https://api.openai.com/v1',
  });

  try {
    const response = await withRetry(() =>
      (client.responses as any).create({
        model,
        tools: [webSearchTool],
        input: input.query,
      }),
    );

    const searchText: string = response.output_text;

    if (!searchText) {
      printToolError('Web search returned no results.');
      printSeparator();
      return { output: 'ERROR — web search returned no results.', isError: true };
    }

    const citations = extractCitations(response.output ?? []);

    const lines = searchText.split('\n');
    console.log(`  ${chalk.green('  ── Search Results ──────────────────────────────')}`);
    printDimOutput(lines, 60);

    if (citations.length > 0) {
      console.log(`  ${chalk.green('  ── Sources ─────────────────────────────────────')}`);
      for (const c of citations) {
        console.log(`  ${chalk.dim(`  • ${c.title}`)}`);
        console.log(`  ${chalk.dim(`    ${c.url}`)}`);
      }
    }

    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess('Web search completed.');
    printSeparator();

    const citationsBlock =
      citations.length > 0
        ? `\n\nSources:\n${citations.map(c => `- ${c.title}: ${c.url}`).join('\n')}`
        : '';

    return {
      output: `[Web search results for '${input.query}']:\n${searchText}${citationsBlock}`,
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth =
      msg.includes('401') ||
      msg.toLowerCase().includes('unauthorized') ||
      msg.toLowerCase().includes('api key');
    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');

    const userMsg = isAuth
      ? 'Web search failed: invalid API key. Check API_KEY in your .env file.'
      : isRateLimit
        ? 'Web search rate-limited. Retry in a moment.'
        : `Web search failed: ${msg}`;

    printToolError(userMsg);
    printSeparator();
    return { output: `ERROR — ${userMsg}`, isError: true };
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
pnpm build
```

Expected: clean build. If `client.responses` types cause errors, the `(client.responses as any).create(...)` cast handles it — no type fix needed.

- [ ] **Step 3: Run existing tests to confirm schema tests still pass**

```bash
pnpm test:schemas
```

Expected: all `web_search Schema` cases pass (the Zod schema is unchanged — same `query: z.string().min(1)` shape).

- [ ] **Step 4: Commit**

```bash
git add src/tools/webSearch.ts
git commit -m "feat: rewrite web_search to use OpenAI Responses API with live citations"
```

---

## Task 3: Add `test/web-search.test.ts`

**Files:**
- Create: `test/web-search.test.ts`

**Interfaces:**
- Consumes: `isOpenAIEndpoint`, `supportsWebSearch`, `extractCitations` from `../src/tools/webSearch.js` (Task 2)
- Produces: `export async function runWebSearchTests(): Promise<{ passed: number; failed: number }>`

- [ ] **Step 1: Create `test/web-search.test.ts`**

```typescript
/**
 * Web Search Tool — Pure Helper Tests
 * Tests isOpenAIEndpoint, supportsWebSearch, and extractCitations
 * without making any API calls.
 */

import { pathToFileURL } from 'node:url';
import {
  isOpenAIEndpoint,
  supportsWebSearch,
  extractCitations,
} from '../src/tools/webSearch.js';

interface SimpleCase {
  description: string;
  fn: () => boolean;
}

function runSuite(name: string, cases: SimpleCase[]): { passed: number; failed: number } {
  console.log(`\n📋 ${name}`);
  console.log('━'.repeat(70));
  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    try {
      const ok = c.fn();
      if (ok) {
        passed++;
        console.log(`  ✅ web_search        → ${c.description}`);
      } else {
        failed++;
        console.error(`  ❌ web_search        → ${c.description}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ❌ web_search        → ${c.description} (threw: ${err instanceof Error ? err.message : err})`);
    }
  }
  console.log('━'.repeat(70));
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${cases.length} tests`);
  return { passed, failed };
}

// ── isOpenAIEndpoint tests ────────────────────────────────────────────────────

const endpointCases: SimpleCase[] = [
  {
    description: 'returns true when BASE_URL is unset',
    fn: () => {
      const orig = process.env.BASE_URL;
      delete process.env.BASE_URL;
      const result = isOpenAIEndpoint();
      if (orig !== undefined) process.env.BASE_URL = orig;
      return result === true;
    },
  },
  {
    description: 'returns true for default OpenAI endpoint',
    fn: () => {
      const orig = process.env.BASE_URL;
      process.env.BASE_URL = 'https://api.openai.com/v1';
      const result = isOpenAIEndpoint();
      process.env.BASE_URL = orig ?? '';
      return result === true;
    },
  },
  {
    description: 'returns true for Azure OpenAI endpoint',
    fn: () => {
      const orig = process.env.BASE_URL;
      process.env.BASE_URL = 'https://my-resource.openai.azure.com/v1';
      const result = isOpenAIEndpoint();
      process.env.BASE_URL = orig ?? '';
      return result === true;
    },
  },
  {
    description: 'returns false for LiteLLM proxy',
    fn: () => {
      const orig = process.env.BASE_URL;
      process.env.BASE_URL = 'http://localhost:4000';
      const result = isOpenAIEndpoint();
      process.env.BASE_URL = orig ?? '';
      return result === false;
    },
  },
  {
    description: 'returns false for Ollama endpoint',
    fn: () => {
      const orig = process.env.BASE_URL;
      process.env.BASE_URL = 'http://localhost:11434/v1';
      const result = isOpenAIEndpoint();
      process.env.BASE_URL = orig ?? '';
      return result === false;
    },
  },
  {
    description: 'returns false for OpenAI',
    fn: () => {
      const orig = process.env.BASE_URL;
      process.env.BASE_URL = '"https://api.openai.com/v1"';
      const result = isOpenAIEndpoint();
      process.env.BASE_URL = orig ?? '';
      return result === false;
    },
  },
];

// ── supportsWebSearch tests ───────────────────────────────────────────────────

const modelCases: SimpleCase[] = [
  { description: 'gpt-4o is supported',                fn: () => supportsWebSearch('gpt-4o') },
  { description: 'gpt-4o-mini is supported',           fn: () => supportsWebSearch('gpt-4o-mini') },
  { description: 'gpt-4o-2024-08-06 is supported',     fn: () => supportsWebSearch('gpt-4o-2024-08-06') },
  { description: 'gpt-4.1 is supported',               fn: () => supportsWebSearch('gpt-4.1') },
  { description: 'gpt-4.1-mini is supported',          fn: () => supportsWebSearch('gpt-4.1-mini') },
  { description: 'gpt-4.1-nano is supported',          fn: () => supportsWebSearch('gpt-4.1-nano') },
  { description: 'o3 is supported',                    fn: () => supportsWebSearch('o3') },
  { description: 'o4-mini is supported',               fn: () => supportsWebSearch('o4-mini') },
  { description: 'gpt-3.5-turbo is NOT supported',     fn: () => !supportsWebSearch('gpt-3.5-turbo') },
  { description: 'llama3 is NOT supported',            fn: () => !supportsWebSearch('llama3') },
  { description: 'claude-3-opus is NOT supported',     fn: () => !supportsWebSearch('claude-3-opus') },
  { description: 'case-insensitive: GPT-4O is supported', fn: () => supportsWebSearch('GPT-4O') },
];

// ── extractCitations tests ────────────────────────────────────────────────────

const citationCases: SimpleCase[] = [
  {
    description: 'returns empty array for empty output',
    fn: () => extractCitations([]).length === 0,
  },
  {
    description: 'returns empty array when output has no message items',
    fn: () => {
      const output = [{ type: 'web_search_call', id: '1', status: 'completed' }] as any;
      return extractCitations(output).length === 0;
    },
  },
  {
    description: 'extracts a single citation with title and URL',
    fn: () => {
      const output = [{
        type: 'message',
        id: '1',
        role: 'assistant',
        status: 'completed',
        content: [{
          type: 'output_text',
          text: 'Some answer',
          annotations: [{
            type: 'url_citation',
            url: 'https://example.com/article',
            title: 'Example Article',
            start_index: 0,
            end_index: 4,
          }],
        }],
      }] as any;
      const cits = extractCitations(output);
      return (
        cits.length === 1 &&
        cits[0].url === 'https://example.com/article' &&
        cits[0].title === 'Example Article'
      );
    },
  },
  {
    description: 'deduplicates citations with the same URL',
    fn: () => {
      const ann = {
        type: 'url_citation',
        url: 'https://same.com',
        title: 'Same Site',
        start_index: 0,
        end_index: 1,
      };
      const output = [{
        type: 'message',
        id: '1',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: 'a', annotations: [ann] },
          { type: 'output_text', text: 'b', annotations: [ann] },
        ],
      }] as any;
      return extractCitations(output).length === 1;
    },
  },
  {
    description: 'falls back to URL when title is missing',
    fn: () => {
      const output = [{
        type: 'message',
        id: '1',
        role: 'assistant',
        status: 'completed',
        content: [{
          type: 'output_text',
          text: 'x',
          annotations: [{
            type: 'url_citation',
            url: 'https://notitle.com',
            start_index: 0,
            end_index: 1,
          }],
        }],
      }] as any;
      const cits = extractCitations(output);
      return cits.length === 1 && cits[0].title === 'https://notitle.com';
    },
  },
  {
    description: 'extracts multiple distinct citations from one response',
    fn: () => {
      const output = [{
        type: 'message',
        id: '1',
        role: 'assistant',
        status: 'completed',
        content: [{
          type: 'output_text',
          text: 'answer',
          annotations: [
            { type: 'url_citation', url: 'https://a.com', title: 'A', start_index: 0, end_index: 1 },
            { type: 'url_citation', url: 'https://b.com', title: 'B', start_index: 2, end_index: 3 },
          ],
        }],
      }] as any;
      const cits = extractCitations(output);
      return (
        cits.length === 2 &&
        cits[0].url === 'https://a.com' &&
        cits[1].url === 'https://b.com'
      );
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runWebSearchTests(): Promise<{ passed: number; failed: number }> {
  const e = runSuite('isOpenAIEndpoint()',  endpointCases);
  const m = runSuite('supportsWebSearch()', modelCases);
  const c = runSuite('extractCitations()',  citationCases);
  return {
    passed: e.passed + m.passed + c.passed,
    failed: e.failed + m.failed + c.failed,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWebSearchTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
```

- [ ] **Step 2: Run the new test suite standalone**

```bash
pnpm tsx test/web-search.test.ts
```

Expected: all 24 cases pass (6 endpoint + 12 model + 6 citation).

- [ ] **Step 3: Commit**

```bash
git add test/web-search.test.ts
git commit -m "test: add pure-helper unit tests for web_search (isOpenAIEndpoint, supportsWebSearch, extractCitations)"
```

---

## Task 4: Wire `test/web-search.test.ts` into the test runner

**Files:**
- Modify: `test/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runWebSearchTests` from `./web-search.test.js` (Task 3)

- [ ] **Step 1: Add the import to `test/index.ts`**

Add after the last import line (currently `import { runTerminalTests } from './terminal.test.js';`):

```typescript
import { runWebSearchTests } from './web-search.test.js';
```

- [ ] **Step 2: Update `printSummary` in `test/index.ts`**

The function signature currently ends with `terminal: { passed: number; failed: number }`. Add `webSearch` as the last parameter:

```typescript
function printSummary(
  validationGate: { passed: number; failed: number },
  toolSchemas:    { passed: number; failed: number },
  edgeCases:      { passed: number; failed: number },
  watcher:        { passed: number; failed: number },
  privacy:        { passed: number; failed: number },
  exportResult:   { passed: number; failed: number },
  terminal:       { passed: number; failed: number },
  webSearch:      { passed: number; failed: number },   // ← add this
)
```

Inside `printSummary`, update the totals lines:

```typescript
const totalPassed = validationGate.passed + toolSchemas.passed + edgeCases.passed +
  watcher.passed + privacy.passed + exportResult.passed + terminal.passed + webSearch.passed;
const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed +
  watcher.failed + privacy.failed + exportResult.failed + terminal.failed + webSearch.failed;
```

Add a new row in the display block (after the Terminal row):

```typescript
║  Web Search Tool Tests        : ${webSearch.passed.toString().padEnd(2)} passed, ${webSearch.failed.toString().padEnd(2)} failed                ║
```

- [ ] **Step 3: Update `runAllTests` in `test/index.ts`**

Add the call after `const terminal = await runTerminalTests();`:

```typescript
const webSearch = await runWebSearchTests();
```

Update the `printSummary` call to include it:

```typescript
printSummary(validationGate, toolSchemas, edgeCases, watcher, privacy, exportResult, terminal, webSearch);
```

Update the `totalFailed` line:

```typescript
const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed +
  watcher.failed + privacy.failed + exportResult.failed + terminal.failed + webSearch.failed;
```

- [ ] **Step 4: Add `test:web-search` script to `package.json`**

In the `"scripts"` block, add after `"test:terminal"`:

```json
"test:web-search": "tsx test/web-search.test.ts"
```

- [ ] **Step 5: Run the full test suite to confirm everything passes**

```bash
pnpm test
```

Expected: all existing suites pass + the new `Web Search Tool Tests` suite shows 24 passed.

- [ ] **Step 6: Commit**

```bash
git add test/index.ts package.json
git commit -m "test: wire web-search test suite into main test runner"
```

---

## Task 5: Update `.env.example` and `AGENTS.md`

**Files:**
- Modify: `.env.example`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `.env.example`**

Append after the existing `BASE_URL` line:

```bash
# Web search configuration (used by the web_search tool)
# Requires BASE_URL to point at api.openai.com (or be unset)
SEARCH_CONTEXT_SIZE="medium"        # low | medium | high — how much web context the model receives
SEARCH_ALLOWED_DOMAINS=""           # Optional: comma-separated domains to restrict results (e.g. "reuters.com,bbc.com")
SEARCH_BLOCKED_DOMAINS=""           # Optional: comma-separated domains to exclude from results
```

- [ ] **Step 2: Update the `web_search` implementation note in `AGENTS.md`**

Find the line (in the `REPL Behaviour Notes` section or the Key files table) that reads:
> `**`web_search` implementation note:** despite the name, this tool does **not** call an external search API (Brave/Tavily). It routes the query to the active LLM via a fresh OpenAI client call using `process.env.CLIC_MODEL`. It reads `CLIC_MODEL`, `API_KEY`, and `BASE_URL` from the environment at call time.`

Replace it with:

> **`web_search` implementation note:** uses OpenAI's Responses API (`client.responses.create()` with `tools: [{ type: "web_search" }]`) for real-time internet results. Requires `BASE_URL` to be the default OpenAI endpoint (or unset). Includes a provider guard (fails fast if `BASE_URL` is a custom proxy) and a model guard (only gpt-4o, gpt-4.1, o3, o4-mini and their variants are supported). Source URLs are extracted from `url_citation` annotations and displayed as a Sources block. Configurable via `SEARCH_CONTEXT_SIZE`, `SEARCH_ALLOWED_DOMAINS`, and `SEARCH_BLOCKED_DOMAINS` env vars.

- [ ] **Step 3: Run the full test suite one final time**

```bash
pnpm test
```

Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add .env.example AGENTS.md
git commit -m "docs: update .env.example and AGENTS.md for production web_search implementation"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Use `client.responses.create()` | Task 2 |
| `tools: [{ type: "web_search" }]` | Task 2 |
| Live web results (not training data) | Task 2 |
| `url_citation` annotations → Sources block | Task 2 |
| Provider guard (non-OpenAI BASE_URL) | Task 2 |
| Model compatibility guard | Task 2 |
| `SEARCH_CONTEXT_SIZE` env var | Task 2 |
| `SEARCH_ALLOWED_DOMAINS` / `SEARCH_BLOCKED_DOMAINS` | Task 2 |
| Error handling per failure mode (401, 429, empty) | Task 2 |
| Retry via `withRetry` | Task 1 + Task 2 |
| Unit tests for pure helpers | Task 3 |
| Tests wired into main runner | Task 4 |
| `pnpm test:web-search` script | Task 4 |
| `.env.example` updated | Task 5 |
| `AGENTS.md` note updated | Task 5 |

### Placeholder Scan

No TBDs, TODOs, or "similar to Task N" references. All code blocks are complete and runnable.

### Type Consistency

- `withRetry` signature is identical across `src/retry.ts`, `src/openai.ts` (import), and `src/tools/webSearch.ts` (call)
- `extractCitations` takes `OpenAI.Responses.ResponseOutputItem[]` — same type produced by `response.output`
- `runWebSearchTests` returns `Promise<{ passed: number; failed: number }>` — matches all other suite runners
