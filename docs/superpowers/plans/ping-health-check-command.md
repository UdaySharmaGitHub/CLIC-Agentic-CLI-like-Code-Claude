# Plan: /ping Health Check Command

## Context

CLIC is a Node.js CLI tool (ESM, TypeScript) with a slash-command system in
`src/commands/`. Each command exports `command: SlashCommand` from its own
file and is registered in `src/commands/index.ts`.

The `/ping` command sends a minimal non-streaming chat completion request to
verify that the configured API endpoint is reachable and the API key is
valid, and reports the round-trip latency. It is also run automatically in
the background at startup.

## Global Constraints

- TypeScript/ESM project, `.js` extensions on all local imports
- No external dependencies beyond what already exists (`openai`, `chalk`)
- `runPing` must be exported from `src/commands/ping.ts` so `src/index.ts`
  can call it without importing the whole command
- Tests follow the existing pattern in `test/` — a named `run*Tests()`
  export, plain `console.log` for pass/fail, no test framework
- Latency is measured with `Date.now()` (not `performance.now()`)
- Non-streaming: use `client.chat.completions.create()` without `stream: true`
- `max_tokens: 5` to keep cost near zero
- Error-hint mapping:
  - HTTP 401/403 → "check API_KEY in .env"
  - HTTP 404 → "check BASE_URL and model name in .env"
  - Any other error → "check BASE_URL in .env"
- Success output format: `✅ API reachable — model: <name> — latency: <N>ms`
- Failure output format: `❌ API unreachable — <code/message> — <hint>`
- Startup ping timeout: 4000 ms (a `Promise.race` against a 4 s sentinel)
- Startup ping result is printed between the Knowledge Base line and the
  YOLO warning (before `printSeparator()` and "Agent ready!")
- `pnpm test:ping` script added to `package.json`
- `runPingTests` registered in `test/index.ts` (import + call in runner +
  summary table)

---

## Task 1 — Create `src/commands/ping.ts` and register it

### Files
- **Create** `src/commands/ping.ts`
- **Edit** `src/commands/index.ts` (import + push to array)

### Requirements

**`src/commands/ping.ts`**

Export two things:

1. `export async function runPing(client: OpenAI, model: string): Promise<string>`
   - Records `start = Date.now()`
   - Calls `client.chat.completions.create({ model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })` — non-streaming
   - On success: returns `✅ API reachable — model: <model> — latency: <Date.now()-start>ms`
   - On error: extracts status code if available; maps to hint per Global Constraints; returns failure string
   - Import `OpenAI` type from `openai`

2. `export const command: SlashCommand`
   - `name: '/ping'`
   - `description: 'Check API endpoint reachability and measure round-trip latency'`
   - `execute(ctx)`: creates a client via `createClient(ctx.model)`, calls `runPing(client, ctx.model)`, prints the result with `console.log`, returns `{ type: 'continue' }`
   - Imports: `createClient` from `'../openai.js'`, `SlashCommand` from `'./types.js'`, `OpenAI` from `'openai'`

**`src/commands/index.ts`** — 2-line change:
- Add `import { command as pingCmd } from './ping.js';` with the other imports
- Add `pingCmd` to the `commands` array

### Tests

None for this task — tests are in Task 3.

### Self-review checklist
- [ ] `runPing` exported (not just the command)
- [ ] `.js` extension on all local imports
- [ ] Non-streaming call, `max_tokens: 5`
- [ ] All three error branches present
- [ ] `pingCmd` registered in `src/commands/index.ts`

---

## Task 2 — Startup background ping in `src/index.ts`

### Files
- **Edit** `src/index.ts`

### Requirements

After `let client = createClient(model)` (the line that currently reads
`let client = createClient(model);` around line 258 in `src/index.ts`),
immediately start the ping in the background:

```typescript
const pingPromise = runPing(client, model);
```

Then, right before the `await printSeparator()` + "Agent ready!" block
(around line 300), resolve the ping with a 4-second timeout and print:

```typescript
const pingTimeout = new Promise<string>(resolve =>
  setTimeout(() => resolve('⏱  Ping timed out — check BASE_URL in .env'), 4000)
);
const pingResult = await Promise.race([pingPromise, pingTimeout]);
console.log(`  ${pingResult}`);
```

Add the import at the top of `src/index.ts`:
```typescript
import { runPing } from './commands/ping.js';
```

The startup ping must NOT block setup (it starts immediately after client
creation but its result is awaited only right before "Agent ready!"). It
must NOT appear in single-turn or paste mode (wrap in `if (!prompt)` check
or place it only on the REPL path after the single-turn early-return).

**Exact placement:**
- `pingPromise` assigned right after `let client = createClient(model);`
- `await Promise.race(...)` + `console.log` placed inside `src/index.ts`
  just before `await printSeparator()` on the "Agent ready!" block, but
  only on the REPL path (after the single-turn `if (prompt) { ... return; }`
  block)

### Self-review checklist
- [ ] `pingPromise` starts immediately after `createClient`
- [ ] Result printed only on REPL path (not single-turn / paste mode)
- [ ] 4000 ms timeout sentinel
- [ ] Indented with two spaces like surrounding `console.log` calls

---

## Task 3 — Tests and package.json wiring

### Files
- **Create** `test/ping.test.ts`
- **Edit** `test/index.ts`
- **Edit** `package.json`

### Requirements

**`test/ping.test.ts`**

Export `export async function runPingTests(): Promise<{ passed: number; failed: number }>`.

Use the same `eq()` helper pattern as the other test files (plain
`console.log`, no test framework). Cover:

1. **Success path** — mock client returns `{ choices: [{ message: { content: 'OK' } }] }`;
   assert result starts with `✅` and contains `latency:` and `ms`
2. **Auth failure** — mock throws `{ status: 401, message: 'Unauthorized' }`;
   assert result starts with `❌` and contains `API_KEY`
3. **Not found** — mock throws `{ status: 404, message: 'Not Found' }`;
   assert result starts with `❌` and contains `BASE_URL`
4. **Network error** — mock throws plain `Error('ECONNREFUSED')`;
   assert result starts with `❌` and contains `BASE_URL`

Build a minimal mock OpenAI client:
```typescript
function mockClient(behavior: 'ok' | { status: number; message: string } | Error): any {
  return {
    chat: {
      completions: {
        create: async () => {
          if (behavior === 'ok')
            return { choices: [{ message: { content: 'OK' } }] };
          throw behavior;
        },
      },
    },
  };
}
```

Import `runPing` from `'../src/commands/ping.js'`.

**`test/index.ts`** — 3 changes:
1. Add `import { runPingTests } from './ping.test.js';`
2. Add `const ping = await runPingTests();` in the runner after `setupWizard`
3. Update `printSummary` signature + call + summary table row for `ping`

**`package.json`**:
- Add `"test:ping": "tsx test/ping.test.ts"` to `scripts`

### Self-review checklist
- [ ] All 4 test cases present and asserting the right prefixes/substrings
- [ ] Mock does not import the real OpenAI SDK
- [ ] `runPingTests` registered in `test/index.ts` (import + call + summary row)
- [ ] `test:ping` in `package.json`
- [ ] Run `pnpm test:ping` — all 4 pass before marking done
