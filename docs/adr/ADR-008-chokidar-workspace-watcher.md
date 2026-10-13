# ADR-008: chokidar Workspace Watcher Injected into System Prompt

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

When the LLM reads a file in one turn and the user (or another process) modifies that file before the next turn, the LLM is unaware of the change. It continues reasoning from stale data. In a developer workflow this happens constantly: a build tool regenerates a file, a linter auto-fixes something, or the user edits a file in their editor while CLIC is running.

We needed a way to make the LLM aware of external file changes without requiring it to poll or re-read every file on every turn.

---

## Decision

Start a **chokidar** file watcher (`src/watcher.ts`) at startup (unless `--no-watch`). It watches the current working directory at depth 4, recording the path and timestamp of every externally-modified file in a 15-minute rolling window.

Before each agent turn, `buildSystemPrompt()` calls `getRecentlyModified()` and injects a `Workspace File Activity` block into the system prompt listing files changed since CLIC last saw them. When `read_file` reads a file, it calls `markRead()` to record that the agent has seen the current version; `getStalenessNote()` prepends a staleness warning if the file changed after the last read.

Pass `--no-watch` to disable the watcher (useful for large repos, NFS mounts, or Docker volumes).

---

## Rationale

- **Passive, zero-cost awareness.** The watcher runs in the background; no extra tool calls are needed. The LLM is informed automatically.
- **System prompt injection is the right layer.** Injecting recent changes into the system prompt means the LLM sees them at the start of every turn without requiring a tool call or a change to the ReAct loop.
- **chokidar is the ecosystem standard** for cross-platform file watching in Node.js. It handles macOS FSEvents, Linux inotify, and Windows ReadDirectoryChangesW uniformly.
- **15-minute rolling window** balances signal-to-noise: old changes (from hours ago) are unlikely to be relevant; recent changes (last 15 minutes) usually are.

---

## Alternatives Considered

- **File hash-on-read** — hash every file when `read_file` reads it; re-hash on next read and warn if changed. Rejected: requires re-reading files to detect changes, adds latency, and only detects changes for files the agent actively re-reads.
- **Agent polls `list_directory` periodically** — the LLM decides when to re-scan. Rejected: requires LLM initiative, burns tool-call budget, and is unreliable.
- **No staleness detection** — the LLM works with whatever it last read. Rejected: leads to subtle bugs where the agent confidently edits a file based on content that no longer exists.

---

## Consequences

**Positive:**
- The agent is proactively aware of workspace changes without polling.
- `read_file` staleness notes give clear, per-file warnings when content may have changed since last read.
- `--no-watch` provides a zero-cost escape hatch for environments where inotify limits are constrained.

**Negative:**
- chokidar watches add OS-level file descriptors. In repos with many files (e.g., inside `node_modules`), this can exhaust inotify limits. Depth 4 and chokidar's `ignored` patterns mitigate this.
- The 15-minute window is a heuristic; a file changed 16 minutes ago will not appear in the activity block even if it's relevant.
- False positives: build tool output files that change frequently create noise in the activity block.

---

## References

- [`src/watcher.ts`](../../src/watcher.ts) — `startWatcher()`, `stopWatcher()`, `markRead()`, `getStalenessNote()`, `getRecentlyModified()`, `formatAgo()`, `computeStalenessNote()`, `selectRecent()`
- [`src/prompts.ts`](../../src/prompts.ts) — `buildSystemPrompt()` injection of `Workspace File Activity` block
- [`src/tools/readFile.ts`](../../src/tools/readFile.ts) — `markRead()` + staleness note prepended to output
- [`src/index.ts`](../../src/index.ts) — `startWatcher()` / `stopWatcher()` on startup and all exit paths
- [`test/watcher.test.ts`](../../test/watcher.test.ts) — pure helper unit tests
