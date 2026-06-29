---
name: run-clic
description: Build, run, and drive CLIC (the CLI tool in this repo). Use when asked to start CLIC, run it, test it, send it a prompt, or verify a change works in the running app.
---

CLIC is a Node.js/TypeScript agentic CLI (REPL + single-turn mode). It requires a real TTY — `@clack/prompts` crashes without one. Drive it via `.claude/skills/run-clic/driver.mjs`, which wraps it in a tmux session so you can send input and read output programmatically.

All paths below are relative to the repo root.

## Prerequisites

```bash
brew install tmux      # provides the PTY; required — the app crashes without one
```

Node.js ≥18 and pnpm are assumed present (they ship with this repo's dev environment). `tsx` is already in `node_modules/.bin/`.

## Setup

Dependencies are already installed (`node_modules/` exists). To reinstall from scratch:

```bash
pnpm install
```

API key and base URL come from `.env` — already populated in this repo.

## Run (agent path)

All commands run via the driver. Run from the repo root.

### Single-turn (most useful for verifying a change)

Runs CLIC with a prompt, waits for the agent to finish, prints the full pane output, then exits:

```bash
node .claude/skills/run-clic/driver.mjs single "list the files in the current directory"
```

Expected output ends with `✔ Task complete after N step(s).`

### Interactive REPL session

Launch and leave the REPL running in the background tmux session:

```bash
node .claude/skills/run-clic/driver.mjs launch
```

Then send a slash command and capture the output:

```bash
node .claude/skills/run-clic/driver.mjs slash /status
node .claude/skills/run-clic/driver.mjs slash /tokens
node .claude/skills/run-clic/driver.mjs slash /help
```

Send a free-form prompt to the running REPL (fires and returns immediately — use `wait` to poll for completion):

```bash
node .claude/skills/run-clic/driver.mjs send "read src/agent.ts and summarise it"
node .claude/skills/run-clic/driver.mjs wait "Task complete after"
node .claude/skills/run-clic/driver.mjs capture
```

Quit cleanly (sends `/exit`, saves history, kills session):

```bash
node .claude/skills/run-clic/driver.mjs quit
```

Force-kill if the session is stuck:

```bash
node .claude/skills/run-clic/driver.mjs kill
```

### Driver command reference

| Command | What it does |
|---|---|
| `single <prompt>` | Full single-turn run: launch → select model → run prompt → print output → exit |
| `launch [model]` | Start an interactive REPL session; leaves it running |
| `send <text>` | Send text + Enter to the running REPL |
| `slash <cmd>` | Send a slash command (e.g. `/status`) and print result |
| `capture` | Print current tmux pane contents |
| `wait <marker>` | Poll until marker string appears (30s timeout) |
| `quit` | Send `/exit` + kill session |
| `kill` | Force-kill tmux session |

The tmux session is named `clic-driver`. Only one session runs at a time.

## Run (human path)

```bash
pnpm dev   # opens the model picker → role picker → REPL. Ctrl-C to quit.
```

Useless in a headless environment — use the driver instead.

Single-turn without interactive pickers (still needs a TTY, so run from a real terminal):

```bash
pnpm dev -- --kb "roles based Workflow/Gen_AI_Engineer.md" --yolo "your prompt here"
```

## Build

```bash
pnpm build   # compiles src/ → dist/ via tsup
pnpm start   # runs dist/index.js (same flags as pnpm dev)
```

## Gotchas

- **`@clack/prompts` crashes without a TTY** — `ERR_TTY_INIT_FAILED: uv_tty_init returned EINVAL` when you try to run `pnpm dev` outside a real terminal (e.g. via a backgrounded bash command). The driver exists entirely to solve this. Never run `pnpm dev` in a backgrounded shell.

- **`--model gpt-4o` doesn't skip the model picker** — `gpt-4o` is `DEFAULT_MODEL` in `src/config.ts`. When the flag matches the default, `src/index.ts` treats it as "not set" and shows the picker anyway. Pass any other model name, or just let the driver select the first option automatically (it presses Enter on whatever is highlighted).

- **Paths with spaces break shell quoting** — the project root contains spaces (`My Workspace/Personal Project/…`). The driver works around this by passing paths through tmux's environment (`CLIC_ROOT`, `CLIC_TSX`, etc.) rather than embedding them in the shell command string.

- **`chat_history.json` grows across sessions** — CLIC appends to history on every run. When verifying a change, `/clear` inside the REPL resets the context. The driver's `single` command doesn't clear history first; if conversation state is polluting results, run `echo "[]" > chat_history.json` before the test.

- **`token_graph.json` is written on every turn** — normal side effect, not an error.

## Troubleshooting

- **`Error: Timed out waiting for "Select the LLM model to use"`** — the API endpoint (BASE_URL in `.env`) is unreachable and `fetchAvailableModelOptions()` hung. Check that the LiteLLM proxy at `localhost:6655` is running, or the model list fetch will time out and the picker may not appear.

- **Session already running error on `launch`** — run `node .claude/skills/run-clic/driver.mjs kill` first.

- **`command not found: tmux`** — install it: `brew install tmux`.
