# Design: Project-Scoped Global Storage

**Date:** 2026-11-02
**Feature:** Global per-project storage (Claude Code-style project scoping)
**Status:** Approved — ready for implementation plan

## Summary

Make CLIC a true **globally-installed CLI** that scopes its state per project —
the way `claude` does. Today CLIC writes `chat_history.json`, `sessions/`,
`sessions.json`, and `token_graph.json` as **relative paths**, so they land in
whatever directory it is run from and pollute the project folder. Instead, all
state moves under a global root (`~/.clic/`), keyed by the project's absolute
path, so each project gets isolated history/sessions/tokens and the project
folder stays clean.

```bash
cd ~/work/my-app     && clic   # → ~/.clic/projects/my-app-7f3a9c21/
cd ~/personal/my-app && clic   # → ~/.clic/projects/my-app-04be1d9a/  (no collision)
```

## Problem

All four storage constants in `src/config.ts` are **relative strings**:

```ts
export const HISTORY_FILE         = 'chat_history.json';
export const TOKEN_GRAPH_FILE     = 'token_graph.json';
export const SESSIONS_DIR         = 'sessions';
export const SESSIONS_INDEX_FILE  = 'sessions.json';
```

Node's `fs` resolves relative paths against `process.cwd()`. Consequences:

1. **Project pollution** — running `clic` in any folder dumps `sessions/`,
   `sessions.json`, `token_graph.json`, and (via migration) `chat_history.json`
   into that folder.
2. **No project isolation** — there is no notion of "this project's history."
   State is tied to CWD only incidentally, and only if you always run from the
   same spot.
3. **Global install is not usable** — credentials (`API_KEY`, `BASE_URL`) are
   read from a `.env` in CWD (`import 'dotenv/config'`), so a global install
   would require a `.env` in every project.

## Scope (decided)

| Concern | Decision |
|---|---|
| Relocate the 4 storage paths to a global per-project root | ✅ In scope (core) |
| Project → directory mapping | ✅ Hybrid: `<basename>-<hash8>` |
| Existing-data migration | ✅ Auto-migrate on first run (lossless, one-time) |
| Global `~/.clic/.env` credential fallback | ✅ In scope |
| Global roles (`~/.clic/roles/`) fallback | ❌ Deferred (follow-up) |
| Project-aware system prompt (name + git branch) | ❌ Deferred (follow-up) |
| `AGENT_*` env path overrides keep working | ✅ Preserved (backward-compat + tests) |

## Project → directory mapping

**Scheme: `<basename>-<hash8>`** where `hash8` is the first 8 hex chars of
`sha256(canonicalPath)`.

- `canonicalPath = fs.realpathSync(process.cwd())` — canonicalizes symlinks and
  trailing-slash variants so the same project always maps to the same dir.
  Fallback to `path.resolve(process.cwd())` if `realpath` throws (e.g. the dir
  was deleted mid-run — not expected at startup, but defensive).
- `basename = path.basename(canonicalPath)`, sanitized to `[A-Za-z0-9_-]`
  (spaces/unicode → `-`), capped at ~40 chars so the final dir name stays short.
- Final: `~/.clic/projects/<basename>-<hash8>/`

**Why hybrid over the two alternatives:**

| Scheme | Collision-safe | Length-safe | Charset-safe | Readable |
|---|---|---|---|---|
| Dashed full path (Claude Code) | ✅ | ❌ whole path = one filename, 255-char cap | ❌ spaces/unicode | ✅ |
| Short hash only | ✅ | ✅ | ✅ | ❌ opaque |
| **Hybrid (chosen)** | ✅ hash covers full path | ✅ fixed, short | ✅ sanitized prefix | ✅ |

The dashed-path scheme breaks on this very repo: the CWD contains spaces
(`My Workspace/Personal Project`) and is deeply nested. The hash covers the full
canonical path, so two same-named folders in different locations never collide;
the readable prefix still lets a human identify the project at a glance.

## Global root resolution

```ts
// src/config.ts
export function clicHome(): string {
  return process.env.CLIC_HOME || path.join(os.homedir(), '.clic');
}
export function projectDirName(cwd = process.cwd()): string { /* basename-hash8 */ }
export function projectRoot(): string {
  return path.join(clicHome(), 'projects', projectDirName());
}
```

- `CLIC_HOME` env var overrides the root (useful for tests + power users).
- The four path getters resolve against `projectRoot()`, **unless** the
  corresponding `AGENT_*` override is set (then the override wins verbatim — this
  preserves existing tests and the documented override behavior).

## Approach

**Centralize path resolution in `config.ts`; everything else is unchanged.**

Today the storage constants are plain `export const` strings consumed directly by
`memory.ts`, `session.ts`, and `knowledgeGraph.ts`. The cleanest change is to turn
the four constants into **functions** (or computed values resolved at startup) that
return absolute paths under `projectRoot()`. Because `config.ts` is the single
import site for all four, the blast radius is contained.

### Constant → resolver change

| Current | Becomes | Resolves to |
|---|---|---|
| `HISTORY_FILE` | `historyFile()` | `<projectRoot>/chat_history.json` |
| `TOKEN_GRAPH_FILE` | `tokenGraphFile()` | `<projectRoot>/token_graph.json` |
| `SESSIONS_DIR` | `sessionsDir()` | `<projectRoot>/sessions` |
| `SESSIONS_INDEX_FILE` | `sessionsIndexFile()` | `<projectRoot>/sessions.json` |
| `sessionHistoryPath(name)` | unchanged signature | `<sessionsDir()>/<name>/chat_history.json` |

Each resolver returns its `AGENT_*` env override verbatim when set; otherwise the
`projectRoot()`-based path. Consumers that currently read the constant switch to
calling the resolver. (Names kept as functions avoids a module-load-time
`process.cwd()` snapshot and lets `CLIC_HOME`/`AGENT_*` be set before first use,
which the test suite relies on.)

### Credential resolution (global `.env` fallback)

`config.ts` currently does `import 'dotenv/config'`, which loads `./.env` only.
Replace with an explicit, ordered load that does **not** overwrite already-set
vars (so shell env always wins):

```ts
import dotenv from 'dotenv';
dotenv.config();                                   // ./.env  (project-local)
dotenv.config({ path: path.join(clicHome(), '.env') }); // ~/.clic/.env (global fallback)
```

`dotenv` does not override existing `process.env` keys by default, so the
effective precedence is: **shell env > ./.env > ~/.clic/.env**. Exactly the
"install once, run anywhere" behavior.

### Migration (auto, first run per project)

Mirror the existing `migrateLegacy()` pattern in `session.ts`. On startup, if the
**project root is new** (no `sessions.json` there yet) and legacy files exist in
CWD, copy them in once:

```
if projectRoot has no sessions.json:
    for each of { chat_history.json, token_graph.json, sessions.json, sessions/ }:
        if exists in CWD and not in projectRoot:
            copy into projectRoot
    print "📦 Migrated existing CLIC state into ~/.clic/projects/<dir>/"
```

- Lossless: copy, not move — the originals stay in CWD untouched (user can delete
  them manually once satisfied).
- One-time: guarded on the project root being fresh.
- Silent no-op for fresh global installs (no legacy files present).
- Gated on `!isEphemeral()` (privacy mode writes nothing).

**Relationship to the existing `migrateLegacy()`:** the two run in sequence and do
not overlap. The new `migrateProjectState()` runs **first** and only relocates files
from CWD into `projectRoot` (a location move). The existing `migrateLegacy()` then
runs **against `projectRoot`** exactly as today — adopting a `projectRoot/chat_history.json`
into `sessions/default/chat_history.json`. Because `migrateLegacy()` already guards on
"index has no sessions yet" and "default history file does not exist", re-running it
in the new root is safe and idempotent. No code change to `migrateLegacy()` itself is
required beyond its inputs now resolving under `projectRoot`.

## Data flow (normal startup, after change)

```
config load:  dotenv(./.env) → dotenv(~/.clic/.env)   [shell env still wins]
projectRoot() = ~/.clic/projects/<basename>-<hash8>
migrateProjectState()  → one-time copy of legacy CWD files if root is fresh
loadGraph(tokenGraphFile())      → <root>/token_graph.json
loadIndex()  (reads sessionsIndexFile() = <root>/sessions.json)
setHistoryFile(sessionHistoryPath(name)) → <root>/sessions/<name>/chat_history.json
... turns run; all saves target <root>/* ...
```

## Error handling / edge cases

- **`realpath` fails** (dir deleted/unreadable) → fall back to
  `path.resolve(cwd)`; never crash at startup.
- **`~/.clic` not writable** → `fs.mkdir(..., {recursive:true})` already wrapped in
  try/catch in `saveIndex`/`saveHistory`/`saveGraph`; saves silently no-op, same as
  today. Startup still works (reads just return empty).
- **`CLIC_HOME` set** → entire root relocates (tests set this to a temp dir).
- **`AGENT_*` override set** → that exact path is used, bypassing `projectRoot()`
  (preserves current tests that point these at fixtures).
- **Ephemeral (`--no-history`)** → `projectRoot()` is still computed (for reads),
  but migration and all writes no-op via the existing privacy guards.
- **Two projects, same basename, different path** → different `hash8` → different
  dirs. No collision (the design's core guarantee).
- **Same project, run from a symlink vs real path** → `realpath` canonicalizes →
  same dir. No duplicate state.

## Testing

Follows the existing `test/*.test.ts` pattern. New suite `test/project-storage.test.ts`:

- `projectDirName()` is stable for the same canonical path, and differs for two
  paths that share a basename but differ in location (the collision guarantee).
- `projectDirName()` sanitizes spaces/unicode in the basename to `[A-Za-z0-9_-]`
  and caps length.
- `projectRoot()` honors `CLIC_HOME`; path resolvers honor `AGENT_*` overrides
  (override wins verbatim) and otherwise sit under `projectRoot()`.
- `sessionHistoryPath(name)` composes under `sessionsDir()`.
- Migration: given a temp `CLIC_HOME` and a temp CWD seeded with legacy files,
  first run copies them into the project root and originals remain; second run is
  a no-op; ephemeral mode copies nothing.
- Credential precedence: shell env beats `./.env` beats `~/.clic/.env` (assert via
  a temp `CLIC_HOME/.env` and a temp project `.env`).

Existing suites must stay green — the `AGENT_*` override path keeps them pointed at
their fixtures, and `CLIC_HOME` isolates anything that touches the real root.

## Documentation

- `AGENTS.md` + `CLAUDE.md` — document the global root (`~/.clic/`), the
  per-project layout, `CLIC_HOME`, the credential precedence chain, and the
  one-time auto-migration. Update the "Generated files (gitignored)" section to
  note they now live under `~/.clic/projects/<dir>/`, not the repo.
- `.env.example` — note that it may live at `~/.clic/.env` for a global install.

## Out of scope (explicit follow-ups)

- **Global roles fallback** — discover `roles based Workflow/` from `~/.clic/roles/`
  when the project has none. Roles are often project-specific; separate issue.
- **Project-aware system prompt** — inject project name + git branch into the
  prompt. Separate UX feature.
- **`clic projects` management command** — list/prune/open project dirs. Nice-to-
  have once multiple projects accumulate.
- **Cross-project session migration tooling** — importing old relative-path state
  from arbitrary locations beyond the one-time CWD auto-migrate.

## Authoring Note — Created with the help of Superpowers Plugin from Claude Code

This feature spec was designed end-to-end using the **Superpowers plugin** for
**Claude Code**.
