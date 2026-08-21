# Workspace File Watching — Design Spec
**Feature:** Priority 4 / Item 13 — Workspace File Watching  
**Date:** 2026-08-15  
**Status:** Approved, ready for implementation

---

## Problem

CLIC's agent has no awareness of external file changes. Two gaps:

1. **Stale reads** — if the user edits a file in their IDE while CLIC is running, the agent reads the outdated version on the next `read_file` call with no warning.
2. **No workspace context** — the agent cannot tell which files the user is actively working on, so it must be told explicitly every time ("look at src/server.ts"). Claude Code and other agentic tools surface this automatically.

---

## Chosen Approach

**Approach 2 — Full: `fs.watch` (via `chokidar`) + `fs.stat` + system prompt injection**

- `chokidar` watches the CWD (scoped, depth-limited, hard exclusions) and tracks external file modifications in a rolling 15-minute window.
- The watcher populates a `recentlyModified` map (filepath → timestamp). `getStalenessNote` compares this against `agentLastSeen` (timestamp of the agent's last read/write) — no `fs.stat` call at read time. One watcher event is cheaper than a syscall on every `read_file`.
- The rolling window is injected into the system prompt before each agent turn as ambient workspace context.
- `--no-watch` flag disables the entire feature — both the ambient context block and the inline staleness notes, since both depend on the watcher's `recentlyModified` map.
- Always-on by default, matching Claude Code's behaviour.

**Dependency:** `chokidar` — cross-platform `fs.watch` wrapper used by VS Code, Webpack, Vite, and Jest. Solves the Linux limitation where `fs.watch`'s `recursive` option is not supported.

---

## New & Modified Files

| File | Change |
|---|---|
| `src/watcher.ts` | **New** — singleton watcher module, all state lives here |
| `src/prompts.ts` | **Modified** — optional `recentFiles` param, injects workspace context block |
| `src/tools/readFile.ts` | **Modified** — prepend staleness note + call `markRead` |
| `src/tools/writeFile.ts` | **Modified** — call `markRead` after successful write |
| `src/tools/modifyFile.ts` | **Modified** — call `markRead` after successful modify |
| `src/index.ts` | **Modified** — start/stop watcher, pass recent files to system prompt, `--no-watch` flag |

---

## `src/watcher.ts` — Full API

### Internal state (module-level, not exported)

```typescript
const recentlyModified = new Map<string, number>(); // filepath → last external change timestamp
const agentLastSeen    = new Map<string, number>(); // filepath → last agent read/write timestamp
let watcherInstance: FSWatcher | null = null;
```

### Exported functions

```typescript
startWatcher(cwd: string): void
```
Starts `chokidar` on `cwd` with the exclusion list and depth cap. Populates `recentlyModified` on `change` and `add` events. No-op if already running. Logs a dim status line to the terminal.

```typescript
stopWatcher(): void
```
Closes the `chokidar` instance. Called from all exit paths in `index.ts`.

```typescript
markRead(filepath: string): void
```
Records `Date.now()` as the agent's last-seen timestamp for `filepath`. Called by `read_file`, `write_file`, and `modify_file` after each successful operation. Prevents the agent's own writes from triggering false staleness warnings.

```typescript
getStalenessNote(filepath: string): string | null
```
Returns a warning string if `recentlyModified.get(filepath) > agentLastSeen.get(filepath)`. Returns `null` otherwise. If the agent has never read the file (`agentLastSeen` has no entry), `undefined > number` is `false` in JS — so no note fires on the agent's first read of a file (correct: the agent is reading fresh content for the first time). Uses `path.relative(cwd, filepath)` for the displayed path. Never throws — all errors return `null`.

Example return value:
```
[Note: src/server.ts was modified externally 2 min ago — this may differ from your last read]
```

```typescript
getRecentlyModified(windowMs?: number): Array<{ path: string; ago: string }>
```
Returns files from `recentlyModified` whose timestamp is within `windowMs` (default: 15 minutes). Sorted most-recent first. Capped at 5 entries. Paths are relative to CWD. Entries older than the window are silently dropped from the map on each call.

### `chokidar` configuration

```typescript
chokidar.watch(cwd, {
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.log',
    '**/chat_history.json',
    '**/token_graph.json',
    '**/sessions/**',
    '**/*.bak',
  ],
  depth: 4,            // max 4 directory levels — keeps large repos cheap
  ignoreInitial: true, // don't fire for files that already exist at startup
  persistent: true,
  usePolling: false,   // native events; user can pass --no-watch on NFS/Docker
})
```

---

## Integration Points

### `src/prompts.ts`

`buildSystemPrompt(knowledgeBase?, recentFiles?)` gains an optional second parameter.

When `recentFiles.length > 0`, the following block is appended to the system prompt (zero token cost when empty):

```
─── Workspace File Activity ─────────────────────────────────────
The following files were recently modified externally (in your editor/IDE):
  • src/server.ts          (2 min ago)
  • src/routes/auth.ts     (8 min ago)
  • src/middleware/jwt.ts  (11 min ago)
These may be relevant to the current task.
─────────────────────────────────────────────────────────────────
```

When more than 5 files are in the window, cap at 5 and append `...and N more`.

### `src/tools/readFile.ts`

At the end of a successful read, before returning the `ToolResult`:

1. Call `getStalenessNote(filepath)` — if non-null, prepend it to `output`.
2. Call `markRead(filepath)` — resets the staleness clock for this file.

The LLM sees:
```
[Note: src/server.ts was modified externally 2 min ago — this may differ from your last read]

[File 'src/server.ts' (142 lines)]:
import express from 'express';
...
```

### `src/tools/writeFile.ts` and `src/tools/modifyFile.ts`

After a successful write/modify, call `markRead(filepath)`. No staleness note needed — the agent just created the new state.

### `src/index.ts`

**CLI flag:**
```typescript
.option('--no-watch', 'Disable workspace file watcher (for large repos or NFS/Docker)')
```

**Startup** (after setup wizard, before REPL):
```typescript
if (!opts.noWatch) {
  startWatcher(process.cwd());
}
```

**Each agent turn** (before `runAgentTurn`):
```typescript
const recentFiles = getRecentlyModified();
systemPrompt = buildSystemPrompt(knowledgeBase, recentFiles);
```

**All exit paths** (SIGINT, `/exit`, stdin EOF):
```typescript
stopWatcher();
```

---

## Terminal UI

Setup output additions:

```
✅ File watcher: Active (CWD, depth 4, 15-min window)
```

When `--no-watch` is passed:
```
⚡ File watcher: Disabled (--no-watch)
```

---

## Startup & Shutdown Sequence

```
printBanner()
setup wizard (API key, model, KB)
startWatcher(cwd)               ← new
buildSystemPrompt(kb, [])       ← initial, no recent files yet
REPL loop:
  user types prompt
  recentFiles = getRecentlyModified()
  systemPrompt = buildSystemPrompt(kb, recentFiles)  ← refreshed each turn
  runAgentTurn(...)
    → read_file → getStalenessNote → markRead
    → write_file / modify_file → markRead
on exit:
  stopWatcher()
  saveHistory()
  saveGraph()
```

Single-turn mode (`pnpm dev -- "prompt"`) also starts the watcher — the staleness note on `read_file` is still useful for one-shot agent runs.

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| `chokidar` import fails (not installed) | `startWatcher` catches error, logs dim warning, returns silently — CLIC continues without watching |
| CWD unreadable or doesn't exist | `chokidar` error event caught, `watcherInstance` set to null, feature degrades gracefully |
| `fs.stat` fails in `getStalenessNote` | Returns `null` — tool call never interrupted |
| Agent writes file → watcher fires | `markRead` called after write resets the clock, so no false staleness warning on next read |
| File modified multiple times rapidly | `recentlyModified` is overwritten with latest timestamp — only last change matters |
| File outside CWD referenced | `markRead` / `getStalenessNote` still work; file won't appear in system prompt (not watched) |
| CLIC's own state files fire watch events | Excluded by `ignored` patterns — never enter `recentlyModified` |
| Large monorepo with many changes | Rolling window trims on every `getRecentlyModified()` call; map stays bounded |

---

## Behavioural Rules Summary

1. **Agent writes never trigger staleness** — `markRead` after write resets the clock.
2. **Staleness note fires once per change cycle** — `markRead` after read resets the clock; won't repeat until another external modification.
3. **System prompt block is zero-cost when idle** — no files in window = no block added.
4. **Paths shown relative to CWD** — `src/server.ts` not `/Users/you/project/src/server.ts`.
5. **Feature is transparent** — watcher runs silently; user only sees output when it matters.

---

## Out of Scope

- True "which file is open in IDE" detection — requires a VS Code extension bridge, separate project.
- Watching files outside CWD.
- Per-file watch subscriptions (the agent does not subscribe to specific files).
- Polling mode — users on NFS/Docker should use `--no-watch`.

---

## Authoring Note — Created with Superpowers Plugin for Claude Code

This feature spec and GitHub issue were designed end-to-end using the
**[Superpowers plugin](https://github.com/anthropics/claude-code)** for **Claude Code**.

### What is the Superpowers Plugin?

Superpowers is a Claude Code plugin that installs a set of structured **engineering skills**
on top of Claude. Instead of asking Claude to "just implement it," Superpowers enforces a
disciplined software engineering workflow before any code is written.

The skill used here was **`superpowers:brainstorming`**, which guided the entire design
process through an 8-step checklist:

| Step | What happened |
|---|---|
| 1. Explore project context | Read `src/agent.ts`, `src/tools/index.ts`, `src/tools/readFile.ts`, `src/index.ts`, `src/prompts.ts`, `src/config.ts`, and existing feature docs |
| 2. Clarifying questions | Asked 3 targeted questions — one at a time — to nail down scope, output location, and startup behaviour |
| 3. Propose approaches | Presented 3 options (stat-only, full chokidar, lazy-watch) with trade-offs and a recommendation |
| 4. Present design | Walked through 4 design sections (architecture, API, integration points, startup/shutdown) and got approval after each |
| 5. Write spec | Produced this document in `docs/superpowers/specs/` |
| 6. Self-review | Automatically scanned for placeholders, contradictions, and ambiguity — found and fixed one inconsistency (stat vs watcher-based staleness note) |
| 7. User review | Handed off to the developer to review before implementation |
| 8. Transition | Next step: invoke `superpowers:writing-plans` to produce a step-by-step implementation plan |

### Why use it?

- **Prevents wasted work** — design is agreed upon before a single line of code is written.
- **Catches ambiguity early** — clarifying questions surface assumptions that would otherwise become bugs.
- **Produces structured specs** — every decision is documented with its reasoning, so future contributors understand the *why*, not just the *what*.
- **Enforces quality gates** — the self-review step automatically checks for vague requirements, internal contradictions, and scope creep before implementation begins.
