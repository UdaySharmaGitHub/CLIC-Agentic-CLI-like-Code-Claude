# Run CLIC End-to-End (Driver)

CLIC is a Node.js/TypeScript agentic CLI (REPL + single-turn mode). It requires a real TTY — `@clack/prompts` crashes without one. Drive it via `.claude/skills/run-clic/driver.mjs`, which wraps it in a tmux session so you can send input and read output programmatically.

All paths below are relative to the repo root.

## Prerequisites

```bash
brew install tmux      # provides the PTY; required — the app crashes without one
```

Node.js ≥ 18 and pnpm are assumed present. `tsx` is already in `node_modules/.bin/`.

## Setup

```bash
pnpm install
```

API key and base URL come from `.env` — must be populated before running.

## Single-turn (most useful for verifying a change)

Runs CLIC with a prompt, waits for the agent to finish, prints the full pane output, then exits:

```bash
node .claude/skills/run-clic/driver.mjs single "list the files in the current directory"
```

Expected output ends with `✔ Task complete after N step(s).`

## Interactive REPL session

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

Send a free-form prompt to the running REPL:

```bash
node .claude/skills/run-clic/driver.mjs send "read src/agent.ts and summarise it"
node .claude/skills/run-clic/driver.mjs wait "Task complete after"
node .claude/skills/run-clic/driver.mjs capture
```

Quit cleanly:

```bash
node .claude/skills/run-clic/driver.mjs quit
```

Force-kill if the session is stuck:

```bash
node .claude/skills/run-clic/driver.mjs kill
```

## Driver command reference

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

## Human path (interactive)

```bash
pnpm dev   # opens model picker → role picker → REPL. Ctrl-C to quit.
```

This path requires a real terminal — use the driver for headless/automated runs.

## Gotchas

- **`@clack/prompts` crashes without a TTY** — use the driver, never run `pnpm dev` in a backgrounded shell
- **`--model gpt-4o` may not skip the picker** — if `gpt-4o` is `DEFAULT_MODEL`, pass any other model name or let the driver press Enter automatically
- **Paths with spaces** — the project root contains spaces; the driver passes paths via tmux environment variables to avoid shell quoting issues
- **`chat_history.json` grows across sessions** — run `echo "[]" > chat_history.json` to reset before a clean test

## Troubleshooting

- **Timeout waiting for model picker** — the LiteLLM proxy at `localhost:6655` may be unreachable; check that `BASE_URL` in `.env` is correct
- **Session already running** — run `node .claude/skills/run-clic/driver.mjs kill` first
- **`command not found: tmux`** — run `brew install tmux`
