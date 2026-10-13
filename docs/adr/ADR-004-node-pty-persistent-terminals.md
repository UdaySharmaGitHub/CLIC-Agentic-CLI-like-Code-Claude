# ADR-004: node-pty for Persistent Terminal Sessions

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

The `run_command` tool executes shell commands on behalf of the LLM. The original implementation used `execa` — a one-shot child process that exits after each command. This meant every command ran in a fresh shell with no inherited state: no working directory changes (`cd`), no activated Python virtual environments, no exported variables.

This was a significant usability gap. A developer workflow often requires:
- `cd src && npm run build` to persist across turns
- `source .venv/bin/activate` to carry the venv into subsequent commands
- `export DEBUG=1` to set an env var for later commands

---

## Decision

Introduce `src/terminal.ts` with a `TerminalManager` singleton backed by **node-pty** PTY (pseudo-terminal) processes. The manager maintains a named pool of persistent shells. `run_command` routes through the implicit `main` terminal by default. Shell state (cwd, env, aliases) persists across tool calls within the same session.

Key design choices:
- Each terminal serialises its commands via a per-entry promise-queue mutex (no concurrent writes to the same PTY).
- Different named terminals can run in parallel (e.g., `main` and `test`).
- A sentinel string protocol detects command exit codes from the PTY output stream.
- `terminalManager.killAll()` is called on every exit path to tear down PTY processes.

Pass `--no-terminals` to disable node-pty and revert to the legacy `execa` path.

---

## Rationale

- **Shell state persistence is a fundamental user expectation.** Without it, the agent cannot reliably simulate a developer working in a terminal.
- **Real PTY means real interactivity.** ANSI escape codes, readline prompts, and programs that require a TTY (e.g., `vim`, some test runners) work correctly.
- **Multiplexing without a framework.** The promise-queue mutex provides safe serial access per terminal while allowing true parallelism across terminals.
- **Graceful fallback.** `--no-terminals` provides an escape hatch when node-pty prebuilds are unavailable (e.g., exotic architectures, some CI environments).

---

## Alternatives Considered

- **`execa` with manual cwd/env tracking** — the REPL could track the current directory and pass `cwd` to each `execa` call. Rejected: cannot track `export`, `source`, `alias`, or other shell state mutations.
- **Docker containers per session** — full isolation, fully reproducible environments. Rejected: too heavy, requires Docker, adds latency, and is far more complex than a PTY pool.
- **`child_process.spawn` with a persistent shell** — similar to node-pty but without PTY semantics; programs that require a TTY would fail, and ANSI handling would be broken.

---

## Consequences

**Positive:**
- Shell state (venv, cwd, env vars) persists naturally across tool calls.
- Interactive programs that require a TTY work correctly inside terminal sessions.
- The `terminal` tool exposes named terminals as a first-class feature for multi-shell workflows.

**Negative:**
- node-pty requires compiled native prebuilds, which can fail on uncommon platforms. The `--no-terminals` flag is the mitigation.
- PTY output includes ANSI escape sequences; `stripAnsi()` is applied before returning tool results to the LLM.
- Sentinel-based exit-code detection is fragile if a command outputs the sentinel string itself (extremely rare in practice).

---

## References

- [`src/terminal.ts`](../../src/terminal.ts) — `TerminalManager`, `stripAnsi()`, `RingBuffer`, `assertValidTerminalName()`
- [`src/tools/terminal.ts`](../../src/tools/terminal.ts) — `terminal` tool with discriminated-union Zod schema
- [`src/tools/runCommand.ts`](../../src/tools/runCommand.ts) — `disableTerminals()`, routing logic
- [`src/index.ts`](../../src/index.ts) — `terminalManager.killAll()` on exit paths
