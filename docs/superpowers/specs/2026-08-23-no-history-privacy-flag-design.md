# Design: `--no-history` / Privacy Flag

**Date:** 2026-08-23
**Feature:** Item #14 in `Feature Optimization.md`
**Status:** Approved — ready for implementation plan

## Summary

Add a `--no-history` flag that runs CLIC as a **fully ephemeral session**: nothing
is written to disk for the duration of the run. Prior context is still loaded once
at startup (read-only), then no further writes occur. Intended for sensitive or
throwaway work.

```bash
pnpm dev --no-history   # nothing written to disk
```

## Problem

CLIC always persists state to disk across three files:

- **Chat history** — `sessions/<name>/chat_history.json` (via `saveHistory()`)
- **Token graph** — `token_graph.json` (via `saveGraph()`; records model, tools, and
  token usage per turn)
- **Session index** — `sessions.json` (via `saveIndex()`; plus per-session directories)

There is no way to opt out. A flag literally named `--no-history` / "Privacy" should
honor its intent and suppress **all** disk writes, not just chat history.

## Scope (decided)

| Concern | Behavior under `--no-history` |
|---|---|
| Chat history writes | Suppressed |
| Token graph writes | Suppressed |
| Session index / directory writes | Suppressed |
| Loading prior context at startup | Still loads once (read-only), then never writes back |
| `--no-history --session <name>` | Warn + run ephemeral (loads that session's history read-only; writes nothing) |

## Approach

**Central "ephemeral" guard at the write boundary**, rather than per-call-site guards.

Guarding each save call individually is fragile: there are ~8 `saveHistory()` and
~5 `saveGraph()` sites in `index.ts`, plus single-turn mode, the SIGINT handlers, and
auto-compact — every current and future write site would have to remember the guard.

Instead, one runtime flag is checked inside the three *write* functions. Reads are
always allowed (they never touch disk, and we want context loaded once); only writes
are gated. This makes the privacy guarantee structural, and neutralizes all write
paths — including single-turn, SIGINT, and auto-compact — automatically.

### Components

1. **`src/privacy.ts`** (new) — single source of truth for the runtime flag; no deps,
   so no import cycles.
   ```ts
   let ephemeral = false;
   export function setEphemeral(v: boolean): void { ephemeral = v; }
   export function isEphemeral(): boolean { return ephemeral; }
   ```
2. **`src/memory.ts`** — `saveHistory()` early-returns when `isEphemeral()`.
   `loadHistory()` unchanged (read path is safe and desired).
3. **`src/knowledgeGraph.ts`** — `saveGraph()` early-returns when ephemeral.
   `loadGraph()` unchanged.
4. **`src/session.ts`** — `saveIndex()` early-returns when ephemeral (neutralizes the
   JSON writes inside `migrateLegacy`, `ensureSession`, `setActive`, `createSession`).
   The `fs.mkdir` calls in `migrateLegacy` and `createSession` are additionally gated
   on `!isEphemeral()` so no empty session directory is created on disk.
5. **`src/index.ts`** —
   - Declare `.option('--no-history', 'Run ephemerally — write nothing to disk')`.
     Commander maps `--no-history` to `opts.history === false` (same pattern as
     `--no-watch` → `watch: false`). Add `history?: boolean` to the `opts` type.
   - Early in `main`: `setEphemeral(opts.history === false)`.
   - Skip `migrateLegacy()`, `ensureSession()`, and `setActive()` when ephemeral.
   - Print the privacy banner, and the `--session` combo-warning when both are passed.

### Data flow (ephemeral startup)

```
setEphemeral(true)
loadGraph()      → reads token_graph.json (safe)          [KG in memory]
loadIndex()      → reads sessions.json    (safe)          [resolve names only]
(skip migrateLegacy — it writes)
sessionName = opts.session ?? getActive() ?? DEFAULT_SESSION
(skip ensureSession / setActive — they write)
setHistoryFile(...) + loadHistory()  → reads prior chat (safe)  [context loaded once]
addNode(session)  → in-memory KG node (saveGraph is a no-op)
... turns run; every saveHistory / saveGraph / saveIndex is a no-op ...
```

### Startup banner

```
🔒 Privacy: History, token graph, and session index will NOT be written to disk.
```

When `--session` is also passed:

```
⚠️  Privacy mode: "<name>" will run ephemeral — prior history is loaded read-only, nothing is saved.
```

## Error handling / edge cases

- `--no-history --session work` → warn, load `work`'s existing history read-only,
  proceed; write nothing.
- Mid-session `/session new|switch|rename|delete` under ephemeral: JSON state never
  persists (central guards), so these behave as in-memory-only. Expected behavior; no
  new disk state is created.
- Single-turn (`--no-history "prompt"`) and `--paste` hit the same central guards →
  nothing written.
- SIGINT / auto-compact save paths → neutralized by the same guards.

## Testing

Follows the existing `test/*.test.ts` pattern:

- `saveHistory()` / `saveGraph()` / `saveIndex()` perform no disk write when
  `isEphemeral()` is `true` (assert target file unchanged/absent, or spy on
  `fs.writeFile`).
- `loadHistory()` still populates messages when ephemeral (read path unaffected).
- `setEphemeral(false)` restores normal write behavior (no cross-test leakage).

## Documentation

- Update `CLAUDE.md` — add `--no-history` to the CLI flags block and a REPL note.
- Mark item #14 `[x]` in `Feature Optimization.md`.

## Out of scope

- Redacting secrets from terminal output (separate item #31).
- Encrypting on-disk state when history *is* enabled.

## Follow-up: Mid-session `/privacy` command

The `--no-history` flag can only be set at launch. A `/privacy` slash command adds a
mid-session toggle: it opens an arrow-key picker (`@clack/prompts` `select`, mirroring
`/model` and `/role`) with `initialValue` set to the current mode so the picker shows
which mode is active, and flips ephemeral state on selection.

- **No `CommandContext` / `index.ts` changes** — privacy state is the `src/privacy.ts`
  singleton, so `src/commands/privacy.ts` calls `setEphemeral()` directly and returns
  `{ type: 'continue' }`.
- **Partial-protection honesty (warnings on every transition):**
  - Enabling (OFF→ON) does **not** erase turns already written to disk this session.
  - Disabling (ON→OFF) writes the **full in-memory history — including turns recorded
    while privacy was ON — on the next save.**
- **Testability:** the pure `privacyTransition(from, to)` helper (change flag + warning
  lines) is exported and unit-tested in `test/privacy.test.ts`; the interactive
  `select()` UI is not unit-tested (consistent with `/model` and `/role`).
- `/status` prints the current privacy state via `isEphemeral()`.

## Authoring Note — Created with the help of Superpowers Plugin from Claude Code

This feature spec and GitHub issue were designed end-to-end using the
**[Superpowers plugin](https://github.com/anthropics/claude-code)** for **Claude Code**.
