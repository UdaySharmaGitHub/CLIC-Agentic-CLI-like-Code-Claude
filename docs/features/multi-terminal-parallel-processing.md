# Multi-Terminal Parallel Processing (node-pty)

> **Status: ✅ IMPLEMENTED.** The design and implementation are complete. `src/terminal.ts`, `src/tools/terminal.ts`, and the updated `src/tools/runCommand.ts` are all landed. This document is the living reference for the feature.

## Table of Contents

- [Overview](#overview)
- [Motivation](#motivation)
- [Design decisions (locked)](#design-decisions-locked)
- [Architecture](#architecture)
  - [Files involved](#files-involved)
  - [Terminal lifecycle diagram](#terminal-lifecycle-diagram)
  - [Command execution flow](#command-execution-flow)
  - [Parallel execution across terminals](#parallel-execution-across-terminals)
  - [Terminal pool creation & parallel exec (sequence)](#terminal-pool-creation--parallel-exec-sequence)
  - [Terminal isolation model (no inter-terminal communication)](#terminal-isolation-model-no-inter-terminal-communication)
  - [Key types / interfaces](#key-types--interfaces)
- [The sentinel completion protocol](#the-sentinel-completion-protocol)
- [Tool surface](#tool-surface)
  - [`run_command` (enhanced, persistent)](#run_command-enhanced-persistent)
  - [`terminal` (new, multiplexed)](#terminal-new-multiplexed)
- [Configuration & flags](#configuration--flags)
- [Safety model](#safety-model)
- [Lifecycle & teardown](#lifecycle--teardown)
- [Edge cases & risks](#edge-cases--risks)
- [Implementation plan (phased)](#implementation-plan-phased)
- [Testing strategy](#testing-strategy)
- [Rollback plan](#rollback-plan)
- [Related features](#related-features)

## Overview

Today every shell command in CLIC runs through `run_command`, which calls `execa('bash', ['-c', cmd])` — a **fresh, throwaway subprocess per call**. There is no shared shell state: a `cd` in one call is gone by the next, environment exports evaporate, virtualenv activation doesn't stick, and long-running processes (dev servers, watchers, REPLs) cannot be started and later inspected.

This feature introduces a **Terminal Manager** — a singleton that owns a pool of persistent [`node-pty`](https://github.com/microsoft/node-pty) shell processes. Each "terminal" is a real pseudo-terminal running an interactive shell that **retains its working directory, environment, and process state across commands**. Because each terminal is an independent PTY, multiple terminals can execute **truly in parallel** — the agent can run a test suite in one terminal while a dev server streams logs in another.

The agent reaches this through two tools:
- **`run_command`** — enhanced to run inside a persistent terminal (default `main`). Backward-compatible signature; now stateful.
- **`terminal`** — a new multiplexed tool (`action`-based, mirroring the existing `github` tool) that manages the terminal pool: create, list, read buffered output, write stdin, start background processes, and kill.

## Motivation

| Limitation today (`execa` per call) | With persistent terminals |
|---|---|
| `cd sub/dir` then `pwd` → back at repo root | `cwd` persists across commands |
| `export TOKEN=x` then use it → unset | Environment persists |
| `source .venv/bin/activate` → no effect on next call | Activation sticks |
| `pnpm dev` (long-running) → blocks 60s then times out | Runs in a background terminal, logs readable on demand |
| Two independent tasks → run one after another | Run concurrently in two terminals |
| Interactive prompt (`npm login`) → hangs, no way to answer | `terminal(write)` sends stdin |

Persistent shell state is the single largest capability gap between CLIC and production agentic coding tools (Claude Code, Cursor). This closes it.

## Design decisions (locked)

Two decisions were confirmed with the user before writing this plan:

1. **`run_command` becomes persistent.** It is rewired onto a default `main` terminal from the pool. This is a deliberate behavior change — state now carries between calls — because that persistence *is* the feature. The old ephemeral `execa` path is removed (kept in git history / behind the rollback plan).
2. **One multiplexed `terminal` tool** with an `action` field (`create | list | read | write | start | kill`), rather than 5–6 separate tools. This keeps the tool-definitions payload small and follows the precedent set by the existing `github` tool.

## Architecture

### Files involved

| File | Role in this feature |
|---|---|
| `src/terminal.ts` | **NEW.** `TerminalManager` singleton — owns the PTY pool, per-terminal output ring buffers, the sentinel completion protocol, per-terminal command queue (mutex), and all lifecycle (`spawn`, `exec`, `startBackground`, `read`, `write`, `kill`, `killAll`). Also exports pure helpers (`parseSentinel`, `stripAnsi`, `RingBuffer`, `assertValidTerminalName`) for unit testing. |
| `src/tools/runCommand.ts` | **REWRITE.** Delegates to `TerminalManager.exec(terminal ?? 'main', command)` instead of `execa`. Adds optional `terminal` param. Keeps the same UI (header, diff-free dim output, safety gate, confirm). |
| `src/tools/terminal.ts` | **NEW.** The multiplexed `terminal` tool — `definition` + `execute()` + Zod `schema` with a discriminated union on `action`. Routes to `TerminalManager`. |
| `src/tools/index.ts` | Register the new `terminal` tool in the `tools` array. |
| `src/safety.ts` | Reused unchanged for per-command blocking; a note added about persistent-state implications (see [Safety model](#safety-model)). |
| `src/config.ts` | Add `TERMINAL_MAX`, `TERMINAL_CMD_TIMEOUT_MS`, `TERMINAL_BUFFER_LINES`, `TERMINAL_SHELL` and a `--no-terminals` opt-out wiring point. |
| `src/index.ts` | Wire `TerminalManager.killAll()` into **every** exit path (SIGINT idle, `/exit`, single-turn, `--paste`, error paths). Optionally pre-spawn `main` lazily on first use. |
| `src/ui.ts` | Add `printTerminalHeader`, `printTerminalList`, `printBackgroundStarted` renderers (reusing existing box/dim helpers). |
| `src/agent.ts` | Extend `getToolDetail()` with a `case 'terminal'` for the queued-tools preview line. |
| `src/prompts.ts` | Add a short "Terminals" capability note to the system prompt so the LLM knows persistent terminals exist and when to use background mode. |
| `test/terminal.test.ts` | **NEW.** Unit tests for the pure helpers + light integration tests for spawn/exec/kill. |
| `package.json` | Add the `node-pty` dependency (prebuilt variant — see [risks](#edge-cases--risks)) and a `test:terminal` script. |

### Terminal lifecycle diagram

```mermaid
stateDiagram-v2
    [*] --> Spawning: create / first run_command
    Spawning --> Idle: PTY ready, shell prompt seen
    Idle --> Running: exec(command)
    Running --> Idle: sentinel + exit code parsed
    Idle --> Background: start(command)
    Background --> Background: read() / write() while alive
    Background --> Idle: process exits
    Running --> Killed: timeout / kill
    Background --> Killed: kill
    Idle --> Killed: kill / killAll on exit
    Killed --> [*]
```

### Command execution flow

```mermaid
flowchart TD
    A[LLM calls run_command\n command, terminal?] --> B[executeTool → Zod gate]
    B --> C[isCommandSafe]
    C -- blocked --> Z[return error]
    C -- safe --> D[confirm prompt]
    D -- no --> Y[return rejected]
    D -- yes --> E[TerminalManager.exec\n terminal='main']
    E --> F{terminal exists?}
    F -- no --> G[spawn PTY\n shell + cwd + env]
    F -- yes --> H[enqueue on per-terminal mutex]
    G --> H
    H --> I[write: command + sentinel printf]
    I --> J[read PTY stream into ring buffer\n until sentinel regex matches]
    J --> K[parse exit code, strip ANSI,\n slice sentinel out]
    K --> L[return ToolResult\n output + exit code]
```

### Parallel execution across terminals

The agent's existing multi-tool path in `src/agent.ts` already runs multiple tool calls concurrently via `Promise.all` when the user chooses "parallel". With persistent terminals this becomes genuinely useful:

```mermaid
flowchart LR
    subgraph LLM response: 2 tool calls
      TC1[run_command\n terminal='tests'\n 'pnpm test']
      TC2[run_command\n terminal='build'\n 'pnpm build']
    end
    TC1 --> P[Promise.all]
    TC2 --> P
    P --> PTY1[(PTY: tests)]
    P --> PTY2[(PTY: build)]
    PTY1 --> R1[result 1]
    PTY2 --> R2[result 2]
```

**Concurrency invariant:** different terminals run in parallel; **the same terminal serializes** its commands through a per-terminal promise queue (mutex). Two `exec` calls targeting `main` never interleave their sentinels.

### Terminal pool creation & parallel exec (sequence)

The pool has no parent/child hierarchy — every terminal is a flat, independent entry created on demand (implicitly by `run_command`, or explicitly via `terminal(create)`) and registered in the same `TerminalManager` pool:

```mermaid
sequenceDiagram
    participant LLM as Agent / LLM
    participant TM as TerminalManager (singleton pool)
    participant Main as PTY: main
    participant Tests as PTY: tests
    participant Build as PTY: build

    LLM->>TM: run_command("pnpm install")  (terminal defaults to "main")
    TM->>TM: pool.has("main")? no
    TM->>Main: spawn(shell, cwd, env)
    Main-->>TM: PTY ready
    TM->>Main: write(cmd + sentinel)
    Main-->>TM: sentinel matched, exit code
    TM-->>LLM: ExecResult{output, exitCode}

    LLM->>TM: terminal(create, name="tests")
    TM->>TM: pool.size < TERMINAL_MAX? yes
    TM->>Tests: spawn(shell, cwd, env)
    Tests-->>TM: PTY ready
    TM-->>LLM: TerminalInfo{name:"tests", status:"idle"}

    LLM->>TM: terminal(create, name="build")
    TM->>Build: spawn(shell, cwd, env)
    Build-->>TM: PTY ready
    TM-->>LLM: TerminalInfo{name:"build", status:"idle"}

    par parallel exec (Promise.all)
        LLM->>TM: run_command("pnpm test", terminal="tests")
        TM->>Tests: write(cmd + sentinel)
        Tests-->>TM: sentinel matched
        TM-->>LLM: ExecResult (tests)
    and
        LLM->>TM: run_command("pnpm build", terminal="build")
        TM->>Build: write(cmd + sentinel)
        Build-->>TM: sentinel matched
        TM-->>LLM: ExecResult (build)
    end
```

### Terminal isolation model (no inter-terminal communication)

Terminals never talk to each other directly — the only shared state is the `TerminalManager` pool itself, and the only orchestrator is the agent issuing separate tool calls:

```mermaid
flowchart TB
    subgraph Agent["Agent (src/agent.ts)"]
        LLM["LLM response: N tool calls"]
    end

    subgraph TMBox["TerminalManager singleton (src/terminal.ts)"]
        Pool["Terminal pool (Map&lt;name, PTY&gt;)"]
        Mutex1["mutex: main"]
        Mutex2["mutex: tests"]
        Mutex3["mutex: build"]
    end

    subgraph PTYs["Independent PTY processes"]
        Main[("PTY: main\ncwd, env, shell state")]
        Tests[("PTY: tests\ncwd, env, shell state")]
        Build[("PTY: build\ncwd, env, shell state")]
    end

    LLM -- "Promise.all" --> Pool
    Pool --> Mutex1 --> Main
    Pool --> Mutex2 --> Tests
    Pool --> Mutex3 --> Build

    Main -. "no direct link" .-x Tests
    Tests -. "no direct link" .-x Build
    Main -. "no direct link" .-x Build

    Main -- "ExecResult" --> Agent
    Tests -- "ExecResult" --> Agent
    Build -- "ExecResult" --> Agent

    classDef noLink stroke-dasharray: 4 4,stroke:#999,color:#999;
    class Main,Tests,Build noLink;
```

> **Note:** "terminal" names like `tests`/`build` are not children of `main` — all three are siblings in the same flat pool. Coordination between them happens only through the agent (separate tool calls, optionally batched via `Promise.all`) and the per-terminal mutex that serializes commands sent to the *same* terminal.

### Key types / interfaces

```ts
// src/terminal.ts

export type TerminalStatus = 'idle' | 'running' | 'background' | 'killed';

export interface TerminalInfo {
  name: string;
  status: TerminalStatus;
  cwd: string;              // best-effort tracked cwd (via sentinel readback)
  lastCommand?: string;
  pid?: number;
  createdAt: string;
}

export interface ExecResult {
  output: string;           // ANSI-stripped, sentinel removed
  exitCode: number | null;  // null if timed out / still running
  timedOut: boolean;
  terminal: string;
}

export interface TerminalManagerOptions {
  shell: string;            // TERMINAL_SHELL, defaults to $SHELL || 'bash'
  maxTerminals: number;     // TERMINAL_MAX
  cmdTimeoutMs: number;     // TERMINAL_CMD_TIMEOUT_MS
  bufferLines: number;      // TERMINAL_BUFFER_LINES (ring buffer size)
}
```

## The sentinel completion protocol

A PTY is a raw byte stream — there is no "command finished" event. CLIC detects completion by appending a unique **sentinel** after each command and reading until it appears.

For each `exec`, the manager generates a per-command token and writes:

```bash
<command>
printf '\n__CLIC_END__%s__%d__\n' "<token>" "$?"
```

- `<token>` is a per-command unique id derived from a monotonic counter + terminal name (⚠️ **not** `Math.random()`/`Date.now()` inside workflow scripts, but this is normal runtime code so `crypto.randomUUID()` is fine).
- `$?` captures the exit code of `<command>` (the `printf` runs in the same shell, immediately after).
- The manager reads the PTY `onData` stream, appends to the ring buffer, and scans for the regex `/__CLIC_END__(.+?)__(\d+)__/`. On match: extract exit code, strip the sentinel line and the echoed command line, strip ANSI escapes, resolve the `exec` promise.

**Timeout:** if the sentinel doesn't appear within `TERMINAL_CMD_TIMEOUT_MS`, the manager resolves with `{ timedOut: true, exitCode: null }` and leaves the process running (the agent can then `terminal(read)` or `terminal(kill)`). This is strictly better than today's hard 60s `execa` kill.

**cwd tracking (best-effort):** after each command the manager can append `; printf '__CLIC_CWD__%s\n' "$PWD"` to keep `TerminalInfo.cwd` fresh for `terminal(list)`. Optional; behind a flag if it proves noisy.

## Tool surface

### `run_command` (enhanced, persistent)

```jsonc
{
  "name": "run_command",
  "parameters": {
    "command":  "string  (required) — the shell command to execute",
    "terminal": "string  (optional) — target terminal name; defaults to 'main'"
  }
}
```

- Same UI as today: `printToolHeader`, safety gate, `confirm()`, dim output, exit-code line.
- Blocking: waits for the sentinel (or timeout).
- Auto-spawns the target terminal if it doesn't exist yet.
- Backward compatible: existing calls with only `command` work, now with persistence.

### `terminal` (new, multiplexed)

`action`-based, validated by a Zod discriminated union:

| `action` | Params | Behavior |
|---|---|---|
| `create` | `name?`, `cwd?` | Spawn a new named terminal (errors if pool is at `TERMINAL_MAX`). |
| `list` | — | Return all terminals with status, cwd, last command, pid. No confirm. |
| `read` | `name`, `lines?` | Return the last `lines` (default 50) of the terminal's ring buffer. Ideal for polling a background process. No confirm. |
| `write` | `name`, `input` | Send raw stdin to a running/background process (e.g. answer a prompt, send `q`). Confirm required. |
| `start` | `name?`, `command` | Start a **background** (non-blocking) command; return immediately with a note to `read` later. Confirm required + safety gate. |
| `kill` | `name` | Dispose the PTY and remove it from the pool. Confirm required. |

Read-only actions (`list`, `read`) skip `confirm()`; state-changing actions (`create`, `write`, `start`, `kill`) go through `confirm()` and, where a command is involved (`start`), through `isCommandSafe()`.

## Configuration & flags

Added to `src/config.ts`:

| Setting | Default | Purpose |
|---|---|---|
| `TERMINAL_SHELL` | `process.env.SHELL || 'bash'` | Shell binary for each PTY. |
| `TERMINAL_MAX` | `8` | Max concurrent terminals (guards runaway pools). |
| `TERMINAL_CMD_TIMEOUT_MS` | `120_000` | Per-command sentinel timeout (up from today's 60s hard kill; now non-fatal). |
| `TERMINAL_BUFFER_LINES` | `2_000` | Ring-buffer size per terminal. |

New CLI flag on `src/index.ts`:

| Flag | Effect |
|---|---|
| `--no-terminals` | Fall back to the legacy ephemeral `execa` path for `run_command` and disable the `terminal` tool (for environments where native `node-pty` can't load — see risks). |

## Safety model

- **Per-command blocking is unchanged.** Every command (via `run_command` and `terminal(start)`) still passes through `isCommandSafe()` before running.
- **New consideration — persistent state.** Because `cd` now persists, a `cd /` in one call followed by a destructive glob in the next is a new class of footgun. Mitigations:
  - Keep the existing `BLOCKED_PATTERNS` (they match the dangerous command regardless of cwd).
  - Track and display each terminal's `cwd` in `terminal(list)` and in the `run_command` header so the user sees where a command will run before confirming.
  - `confirm()` still gates every state-changing command; nothing runs unattended unless `--yolo`.
- **Privacy / `--no-history`:** terminals are purely in-memory; nothing about them is persisted to disk, so ephemeral mode is unaffected (no new write paths).

## Lifecycle & teardown

`TerminalManager.killAll()` must run on **every** exit path — leaking PTYs leaves orphaned shell processes. Wiring points in `src/index.ts` (all already exist for the watcher, so we piggyback):

- Idle `SIGINT` handler
- `/exit` command path
- Single-turn return
- `--paste` return
- `process.stdin.destroyed` REPL break
- Error/finally paths around `runAgentTurn`

Pattern mirrors `stopWatcher()` — every place that calls `stopWatcher()` also calls `TerminalManager.killAll()`.

## Edge cases & risks

| Risk | Mitigation |
|---|---|
| **`node-pty` is a native module** (needs node-gyp / prebuilt binaries). Can fail to install/load on some platforms. | Use a **prebuilt** distribution (`@homebridge/node-pty-prebuilt-multiarch` or `node-pty` ≥1.0 prebuilds). Wrap the import in a try/catch; if it fails, log a warning and auto-enable `--no-terminals` (legacy `execa` fallback) so CLIC still runs. |
| **ESM import** of a CJS native module. | `import pty from '@homebridge/node-pty-prebuilt-multiarch'` (default import) verified in a Phase-0 spike before anything else is built. |
| **Sentinel appears in command output** (a command echoes the marker string). | Token includes a UUID; collision is effectively impossible. Also anchor the regex to line start. |
| **Interactive full-screen TUIs** (`vim`, `htop`) inside a blocking `run_command`. | The sentinel never appears → command times out gracefully (non-fatal), output still buffered. Document that TUIs belong in `terminal(start)` + `terminal(write)`. |
| **Two `exec` calls to the same terminal race.** | Per-terminal promise-queue mutex serializes them. |
| **Runaway pool** (agent creates many terminals). | Hard `TERMINAL_MAX` cap; `create` errors past the cap. |
| **Buffer growth for chatty servers.** | Fixed-size ring buffer (`TERMINAL_BUFFER_LINES`); oldest lines dropped. |
| **Windows support.** | `node-pty` supports ConPTY, but shell defaults differ. Out of scope for v1; documented as best-effort (macOS/Linux first). |

## Implementation plan (phased)

Each phase is independently reviewable and leaves CLIC in a working state.

- **Phase 0 — Spike & dependency (½ day).**
  Add the prebuilt `node-pty` dep. Write a throwaway script proving: ESM default import works, a PTY spawns a shell, a command runs, the sentinel is detected, and `kill` disposes cleanly on this machine. Decide the exact package here. **Gate: spike passes before any real code.**

- **Phase 1 — `TerminalManager` core (`src/terminal.ts`).**
  Implement spawn, per-terminal ring buffer, sentinel `exec`, per-terminal mutex, `startBackground`, `read`, `write`, `kill`, `killAll`, and pure helpers (`parseSentinel`, `stripAnsi`, `RingBuffer`, `assertValidTerminalName`). Unit-test the pure helpers.

- **Phase 2 — Rewire `run_command`.**
  Replace the `execa` body with `TerminalManager.exec('main', command)`; add the optional `terminal` param + Zod schema; keep all existing UI/safety/confirm. Add `--no-terminals` legacy fallback. Verify backward compatibility.

- **Phase 3 — `terminal` tool (`src/tools/terminal.ts`).**
  Discriminated-union Zod schema on `action`; route each action to `TerminalManager`; register in `tools/index.ts`; add `getToolDetail` case in `agent.ts`; add UI renderers.

- **Phase 4 — Lifecycle + config + prompt.**
  Add config constants + `--no-terminals` flag; wire `killAll()` into all exit paths; add the "Terminals" capability note to `buildSystemPrompt`.

- **Phase 5 — Docs, tests, polish.**
  Flip this doc's status to "implemented", update `CLAUDE.md` (tool list, request-flow, generated-files/lifecycle notes) and `README.md`; finish `test/terminal.test.ts`; add `test:terminal` to `package.json`.

## Testing strategy

- **Pure helpers (fast, no PTY):** `parseSentinel` extracts exit code + strips marker; `RingBuffer` caps at N lines and drops oldest; `stripAnsi` removes escape codes; `assertValidTerminalName` rejects bad names. Mirrors `test/watcher.test.ts` style.
- **Integration (spawns a real PTY):** spawn → `exec('echo hi')` returns `hi` + exit 0; `exec('false')` returns exit 1; `cd`/`export` persistence across two `exec` calls; `startBackground` + `read` sees streamed output; `kill`/`killAll` leave no orphaned pids.
- **Zod gate:** `terminal` schema rejects unknown `action`, missing `name` on `read`/`kill`, etc. (extends `test/zod-validation.test.ts`).
- **New script:** `pnpm test:terminal` → `tsx test/terminal.test.ts`.

## Rollback plan

The feature is gated by `--no-terminals` and the native-import try/catch. If `node-pty` proves unshippable on target platforms, `run_command` transparently falls back to the legacy `execa` implementation (preserved as `execLegacy()` in `runCommand.ts`), and the `terminal` tool is unregistered. No data migration is involved (terminals are in-memory), so rollback is a flag flip.

## Related features

- [Workspace File Watching](workspace-file-watching.md) — shares the singleton + lifecycle-teardown pattern this feature mirrors.
- [Zod Tool Input Validation](zod-tool-input-validation.md) — the `terminal` tool's discriminated-union schema plugs into this validation gate.
- [Named Sessions](named-sessions.md) — potential future integration: per-session terminal pools.
