# ADR-007: Named Session Isolation via Per-Session Directories

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

CLIC persists conversation history so sessions can be resumed after a restart. Initially, a single `chat_history.json` file held all history. As the tool matured, users needed multiple independent contexts — a `work` session for professional tasks, a `personal` session for side projects, a `debug` session for a specific investigation — without them bleeding into each other.

We needed a session model that:
1. Kept histories fully isolated.
2. Was easy to navigate and reset (delete a session = delete a directory).
3. Required no database.

---

## Decision

Each named session gets its own subdirectory under `sessions/<name>/`, containing `chat_history.json`. A top-level `sessions.json` index tracks all session metadata and the currently active session.

`src/session.ts` owns the lifecycle: create, rename, delete, switch, list. `--session <name>` at startup loads or creates a session. `/session` command manages sessions interactively. Legacy root `chat_history.json` is migrated to `sessions/default/chat_history.json` on first run.

---

## Rationale

- **Filesystem isolation is the simplest possible isolation.** Each session is a directory; deleting it is a complete, safe reset with no orphaned data.
- **Diff-friendly.** `sessions/<name>/chat_history.json` can be inspected, diffed, or copied with standard tools.
- **No foreign keys to manage.** Because each session is a separate file, there is no risk of a delete touching another session's data.
- **`sessions.json` index is cheap.** It holds only metadata (name, created date, last active) — not the full history — so it stays small regardless of how much history each session accumulates.

---

## Alternatives Considered

- **Single file with session IDs** — one `chat_history.json` with a `sessionId` field per message. Rejected: deleting a session requires filtering a potentially large file; a bug could corrupt all sessions at once.
- **SQLite** — a single `sessions.db` with a sessions table. Rejected: native dependency risk; no benefit over directories for a CLI tool where users may want to inspect or back up their history with standard tools.
- **No sessions** — one global history. Rejected: context bleed between unrelated tasks degrades LLM response quality and confuses long-running sessions.

---

## Consequences

**Positive:**
- `--session work` and `--session debug` are completely independent; no context bleed.
- Sessions are portable: copy `sessions/work/` to another machine and history follows.
- `/session delete <name>` is safe: it removes exactly one directory with no side effects on others.

**Negative:**
- No cross-session search. Finding a conversation from last week requires knowing which session it was in.
- The `sessions.json` index can get out of sync with the filesystem if session directories are manually manipulated. `listSessions()` reconciles on load, but this is a potential source of confusion.
- `migrateLegacy()` runs on every startup until the legacy `chat_history.json` is removed; this is a one-time migration with no cleanup trigger.

---

## References

- [`src/session.ts`](../../src/session.ts) — full session lifecycle: `createSession()`, `renameSession()`, `deleteSession()`, `setActive()`, `migrateLegacy()`
- [`src/config.ts`](../../src/config.ts) — `SESSIONS_DIR`, `SESSIONS_INDEX_FILE`, `sessionHistoryPath()`
- [`src/commands/session.ts`](../../src/commands/session.ts) — `/session` slash command
- [`src/index.ts`](../../src/index.ts) — `--session` flag handling, `migrateLegacy()` call on startup
