# AGENTS.md — CLIC Project Context

> **Claude Code users:** this file is the single source of truth imported by `CLAUDE.md` via `@AGENTS.md`. Do not duplicate content between the two files.
>
> **All other agentic IDEs** (Cursor, Windsurf, Cline, Antigravity, Copilot Workspace, Continue.dev, Aider, Amazon Q, Devin, Gemini Code Assist, OpenAI Codex): this file is your primary project context. Read it fully before making any changes.

---

## Project Overview

CLIC is a Node.js CLI tool (ESM, TypeScript) built around a **ReAct agentic loop** powered by any **OpenAI-compatible API** via the `openai` npm package. It runs as an interactive REPL or in single-turn non-interactive mode.

### Agent Workflows & Skills (`.agents/skills/`)

Workflows are maintained under `.agents/skills/` as modular, self-contained skills (compatible with Google Antigravity, Cursor, Windsurf, Claude Code, and all major agentic IDEs):

```text
.agents/
└── skills/                       # Native Agentic Skills with YAML frontmatter
    ├── run/SKILL.md
    ├── verify/SKILL.md
    ├── code-review/SKILL.md
    ├── security-review/SKILL.md
    ├── clic-features-doc/SKILL.md
    ├── feature-review/SKILL.md
    ├── update-context/SKILL.md
    └── run-clic/SKILL.md
```

#### Workflows & Skills Directory

| Task | Skill / Workflow File | Slash Command |
|---|---|---|
| Run the app | `.agents/skills/run/SKILL.md` | `/run` |
| Verify a change end-to-end | `.agents/skills/verify/SKILL.md` | `/verify` |
| Code review | `.agents/skills/code-review/SKILL.md` | `/code-review` |
| Security review | `.agents/skills/security-review/SKILL.md` | `/security-review` |
| Document a feature | `.agents/skills/clic-features-doc/SKILL.md` | `/clic-features-doc <feature>` |
| Review a specific feature | `.agents/skills/feature-review/SKILL.md` | `/feature-review <feature>` |
| Update documentation | `.agents/skills/update-context/SKILL.md` | `/update-context` |
| Run CLIC end-to-end (driver) | `.agents/skills/run-clic/SKILL.md` | `/run-clic` |

### Slash Command Routing (for Antigravity & Agentic IDEs)

When the user enters any of the following slash commands in chat, immediately read and execute the corresponding skill:

- `/run` → Execute `.agents/skills/run/SKILL.md`
- `/verify` → Execute `.agents/skills/verify/SKILL.md`
- `/code-review` → Execute `.agents/skills/code-review/SKILL.md`
- `/security-review` → Execute `.agents/skills/security-review/SKILL.md`
- `/clic-features-doc <feature>` → Execute `.agents/skills/clic-features-doc/SKILL.md`
- `/feature-review <feature>` → Execute `.agents/skills/feature-review/SKILL.md`
- `/update-context` → Execute `.agents/skills/update-context/SKILL.md`
- `/run-clic` → Execute `.agents/skills/run-clic/SKILL.md`

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- Copy `.env.example` → `.env`, set `API_KEY` and `BASE_URL`

### Install

```bash
pnpm install
```

### Authentication

Requires `API_KEY` in the environment (your OpenAI or compatible API key). Set `BASE_URL` to point at any OpenAI-compatible endpoint (defaults to `https://api.openai.com/v1`). The setup wizard prompts for these if not set.

---

## Commands

```bash
pnpm dev                        # Run from source with tsx (no build step)
pnpm build                      # Compile to dist/ via tsup (ESM output)
pnpm start                      # Run compiled dist/index.js

# CLI flags (dev or built)
pnpm dev -- --model gpt-4o --max-steps 10 --yolo
pnpm dev -- --kb "roles based Workflow/Gen_AI_Engineer.md"
pnpm dev -- --full-history      # Load entire chat history (no message limit)
pnpm dev -- --session work      # Load or create a named session called "work"
pnpm dev -- --no-history        # Ephemeral session — nothing written to disk
pnpm dev -- --no-watch          # Disable workspace file watcher
pnpm dev -- --no-terminals      # Disable node-pty terminals; fall back to legacy one-shot execa
pnpm dev -- --paste             # Read prompt from stdin until EOF (Ctrl+D), run as single-turn
pnpm dev -- "single-turn prompt here"   # Non-interactive one-shot mode
cat file.txt | pnpm dev -- --paste     # Pipe file contents as single-turn prompt

# Tests
pnpm test                       # Run full test suite
pnpm test:zod                   # Alias for pnpm test
pnpm test:validation-gate       # Zod validation-gate tests
pnpm test:schemas               # Tool schema shape tests
pnpm test:edge-cases            # Edge-case tests
pnpm test:watcher               # Watcher pure-helper tests
pnpm test:privacy               # Privacy / --no-history ephemeral-mode tests
pnpm test:export                # Conversation export formatter tests
pnpm test:terminal              # Terminal module tests
```

TypeScript checking is implicit via `tsx` at runtime. Run `pnpm build` to surface type errors explicitly.

---

## Architecture

### Request flow

```
User input (REPL or single-turn)
  → memory.ts         (pushMessage → getMessages)
  → agent.ts          (runAgentTurn)
    → openai.ts       (streamMessage via OpenAI client)
      ← LLM responds: text + optional tool_calls + token usage
    → tools/index.ts  (executeTool dispatcher)
      → single tool call: executed directly with confirm()
      → multiple tool calls: user prompted "Run all N tools in parallel?"
          yes → all calls run concurrently via Promise.all
          no  → calls run one-by-one sequentially, each with its own confirm()
      → individual tool modules (readFile, writeFile, runCommand, …)
    → knowledgeGraph.ts (record turn: tokens, model, tools used)
    → pricing.ts        (getCost — used by /tokens to display estimated spend)
    → messages pushed back, loop repeats until no more tool_calls
```

### Key files

| File | Role |
|---|---|
| `src/index.ts` | Entry point: CLI parsing, setup wizard, model picker, REPL loop, context-window guard (auto-compact at 80% usage) |
| `src/agent.ts` | ReAct loop — iterates until LLM returns no tool calls or `maxSteps` is reached; supports `AbortSignal` for mid-run cancellation; records each turn in KG |
| `src/openai.ts` | OpenAI SDK wrapper; `createClient()` + `streamMessage()`, assembles streaming tool-call chunks, wraps API call in `withRetry()` (exponential backoff on 429/5xx) |
| `src/memory.ts` | In-memory `ChatMessage[]` store + JSON persistence; exports `pushMessage`, `getMessages`, `popMessage`, `clearMessages`, `loadHistory`, `saveHistory` |
| `src/knowledgeGraph.ts` | Token-tracking Knowledge Graph (session → turn → model/tools/usage); persisted to `token_graph.json` |
| `src/pricing.ts` | Real-time model pricing via LiteLLM proxy `/model/info`; used by `/tokens` to show estimated USD cost |
| `src/prompts.ts` | Builds the system prompt with live system context; injects `Workspace File Activity` block and optional knowledge base |
| `src/config.ts` | Loads `.env` via dotenv; exports all constants, `AppConfig` interface, `loadKnowledgeBase()`, `getContextLimit()` |
| `src/ui.ts` | All terminal rendering: banner, box-drawing, tool headers, status panel, diff view, context progress bar |
| `src/safety.ts` | `isCommandSafe()` (blocked patterns) + `isPathSafe()` (protected paths) |
| `src/privacy.ts` | Runtime ephemeral-session flag for `--no-history`; `saveHistory()`, `saveGraph()`, `saveIndex()` early-return when ephemeral |
| `src/session.ts` | Named-session lifecycle: create, rename, delete, switch; persists `sessions.json` + per-session directories |
| `src/terminal.ts` | `TerminalManager` singleton — pool of persistent node-pty PTY shells with per-entry promise-queue mutex |
| `src/watcher.ts` | Singleton workspace file watcher (chokidar); tracks externally-modified files in a 15-min rolling window |
| `src/tools/index.ts` | Tool registry — maps name → module, exposes `getToolDefinitions()`, `executeTool()` |
| `src/tools/types.ts` | Shared tool types: `ConfirmFn`, `ToolResult`, `ToolDefinition` |
| `src/tools/helpers.ts` | `resolvePath()` + `renderDiff()` (unified diff renderer used by `write_file` and `modify_file`) |
| `src/tools/terminal.ts` | Multiplexed `terminal` tool — discriminated-union Zod schema (`action: create\|list\|read\|write\|start\|kill\|wait`); delegates to `terminalManager` |
| `src/commands/index.ts` | Command registry — maps slash command name → module |
| `src/commands/types.ts` | `SlashCommand`, `CommandContext`, `CommandAction` types |
| `.agents/skills/` | Native Agentic Skills catalog with YAML frontmatter (progressive disclosure) |

---

## Tool System

Each tool is a self-contained module exporting:
- `definition: ToolDefinition` — name, description, JSON Schema + `schema: z.ZodTypeAny` for validation
- `execute(input, confirm)` — runs the action, calls `confirm()` before destructive ops

**Registered tools:** `read_file`, `write_file`, `append_file`, `modify_file`, `list_directory`, `run_command`, `search_files`, `web_search`, `github`, `terminal`

**Zod validation gate:** `executeTool()` calls `tool.definition.schema.safeParse(input)` before invoking `execute()`. If validation fails, returns an error result without calling the tool.

**`write_file` and `modify_file`** render a full-width unified diff before asking for confirmation. `modify_file` also creates a `.bak` backup before patching.

**`web_search`** routes the query to the active LLM via a fresh OpenAI client call — it does not call an external search API.

**To add a new tool:** create `src/tools/myTool.ts` with `definition` and `execute`, then add it to the `tools` array in `src/tools/index.ts`.

---

## Command System (Slash Commands)

Each slash command exports `command: SlashCommand` with `name`, optional `aliases`, `description`, `usage`, and `execute(ctx, args)`.

**Registered commands:** `/compact`, `/model` (alias `/m`), `/role`, `/undo`, `/retry` (alias `/r`), `/tokens`, `/status`, `/history`, `/clear`, `/raw`, `/help`, `/exit`, `/session` (alias `/s`), `/privacy`, `/export`

**`CommandAction`** can be: `continue`, `exit`, `retry`, or `update` (with a `Partial<CommandContext>` payload).

**To add a new command:** create `src/commands/myCommand.ts` exporting `command: SlashCommand`, then add it to the `commands` array in `src/commands/index.ts`.

---

## Model Selection

At startup, CLIC fetches the live model list from the configured API endpoint and presents an interactive picker. Pass `--model <name>` to skip the picker. The `/model` command reloads the list mid-session.

---

## Role / Knowledge Base System

Markdown files in `roles based Workflow/` are auto-discovered at startup and presented as selectable personas. The selected file's content is injected into the system prompt. Pass `--kb <path>` to skip the interactive selector.

---

## Safety & Privacy

- `isCommandSafe()` in `src/safety.ts` blocks dangerous shell patterns
- `isPathSafe()` prevents writes to protected system paths
- `confirm()` is called before every destructive tool operation
- `--yolo` flag skips all `confirm()` prompts
- `--no-history` runs an ephemeral session — nothing written to disk
- `/privacy` command toggles ephemeral mode mid-session

---

## REPL Behaviour Notes

- **Multiline input:** first line ending with `\` or unclosed triple-backtick enters accumulation mode
- **Context Window Guard:** auto-compacts when prompt tokens exceed 80% of model context limit
- **Parallel tools:** when >1 tool call arrives, user is prompted once — "Run all N tools in parallel?"
- **Retry backoff:** `withRetry()` — exponential backoff on HTTP 429/500/502/503/504, up to 4 attempts
- **Workspace watcher:** chokidar watches CWD at depth 4, injects recent file changes into system prompt
- **Persistent terminals:** `run_command` routes through node-pty PTY pool; shell state persists across calls
- **Named sessions:** `--session <name>` or `/session` — each session has its own `sessions/<name>/chat_history.json`

---

## Generated Files (gitignored)

| File | Description |
|---|---|
| `chat_history.json` | Persisted conversation history (legacy root) |
| `sessions/` | Per-session history tree |
| `sessions.json` | Named-session index |
| `token_graph.json` | Knowledge Graph of token usage |
| `.env` | Local environment variables (API keys) |
| `dist/` | Compiled production output |
| `*.bak` | Backup files created by `modify_file` |
| `exports/` | Conversation exports from `/export` |
