# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                        # Run from source with tsx (no build step)
pnpm build                      # Compile to dist/ via tsup (ESM output)
pnpm start                      # Run compiled dist/index.js

# CLI flags (dev or built)
pnpm dev -- --model gpt-4o --max-steps 10 --yolo
pnpm dev -- --kb "roles based Workflow/Gen_AI_Engineer.md"
pnpm dev -- "single-turn prompt here"   # Non-interactive one-shot mode
```

No test runner is configured. TypeScript checking is implicit via `tsx` at runtime.

## Architecture

CLIC is a Node.js CLI tool (ESM, TypeScript) built around a **ReAct agentic loop** powered by any **OpenAI-compatible API** via the `openai` npm package.

### Request flow

```
User input (REPL or single-turn)
  → memory.ts         (pushMessage → getMessages)
  → agent.ts          (runAgentTurn)
    → openai.ts       (streamMessage via OpenAI client)
      ← LLM responds: text + optional tool_calls + token usage
    → tools/index.ts  (executeTool dispatcher)
      → individual tool modules (readFile, writeFile, runCommand, …)
    → knowledgeGraph.ts (record turn: tokens, model, tools used)
    → messages pushed back, loop repeats until no more tool_calls
```

### Key files

| File | Role |
|---|---|
| `src/index.ts` | Entry point: CLI parsing (`commander`), setup wizard (`@clack/prompts`), REPL loop |
| `src/agent.ts` | ReAct loop — iterates until LLM returns no tool calls or `maxSteps` is reached; records each turn in KG |
| `src/openai.ts` | OpenAI SDK wrapper; `createClient()` + `streamMessage()`, assembles streaming tool-call chunks, returns `TokenUsage` |
| `src/memory.ts` | In-memory `ChatMessage[]` store (OpenAI message format) + JSON persistence to `chat_history.json` |
| `src/knowledgeGraph.ts` | Token-tracking Knowledge Graph (session → turn → model/tools/usage); persisted to `token_graph.json` |
| `src/prompts.ts` | Builds the system prompt, optionally injecting a knowledge base file |
| `src/config.ts` | Loads `.env`, exports constants (`DEFAULT_MODEL`, `DEFAULT_MAX_STEPS`, `HISTORY_FILE`, `TOKEN_GRAPH_FILE`) |
| `src/ui.ts` | All terminal rendering: animated banner, box-drawing, tool headers, status panel |
| `src/safety.ts` | `isCommandSafe()` (blocked patterns) + `isPathSafe()` (protected paths) |
| `src/tools/index.ts` | Tool registry — maps name → module, exposes `getToolDefinitions()` + `executeTool()` |
| `src/tools/listModelfromOpenAI.ts` | `list_models` tool + `fetchAvailableModelOptions()` startup helper |
| `src/commands/index.ts` | Command registry — maps slash command name → module, exposes `executeCommand()` + `slashCompleter()` |
| `src/commands/types.ts` | Shared types: `SlashCommand`, `CommandContext` (includes `sessionId`), `CommandAction` |

### Tool system

Each tool is a self-contained module that exports:
- `definition: ToolDefinition` — name, description, JSON Schema parameters (sent to LLM)
- `execute(input, confirm)` — runs the action, calls `confirm()` before destructive ops

Registered tools: `read_file`, `write_file`, `append_file`, `modify_file`, `list_directory`, `run_command`, `search_files`, `web_search`, `github`, `list_models`.

**To add a new tool:** create `src/tools/myTool.ts` with `definition` and `execute`, then import and add it to the `tools` array in `src/tools/index.ts`.

### Command system

Each slash command is a self-contained module that exports `command: SlashCommand` with:
- `name` — the slash string (e.g. `/compact`), optional `aliases` (e.g. `['/r']`)
- `description` / `usage` — shown in `/help`
- `execute(ctx: CommandContext, args?: string) → Promise<CommandAction>`

`CommandContext` carries: `model`, `maxSteps`, `showRaw`, `kbFile`, `systemPrompt`, `yolo`, `sessionId`, and `callLLM` (a single-shot LLM callback used by `/compact`).

`CommandAction` can be: `continue`, `exit`, `retry`, or `update` (with a `Partial<CommandContext>` payload). When `model` changes via `update`, `index.ts` recreates the OpenAI client.

Registered commands: `/compact`, `/model` (alias `/m`), `/role`, `/undo`, `/retry` (alias `/r`), `/tokens`, `/status`, `/history`, `/clear`, `/raw`, `/help`, `/exit`.

**To add a new command:** create `src/commands/myCommand.ts` exporting `command: SlashCommand`, then import and add it to the `commands` array in `src/commands/index.ts`.

### Knowledge Graph (token tracking)

`src/knowledgeGraph.ts` maintains an in-memory graph with four node types and four edge types:

```
Session -[HAS_TURN]->   Turn
Turn    -[USED_MODEL]-> Model   (singleton per model name)
Turn    -[CALLED_TOOL]-> Tool   (singleton per tool name)
Turn    -[HAS_USAGE]->  TokenUsage
```

After every agent turn, `agent.ts` writes a `Turn` node with its `TokenUsage` (actual from API, or estimated at ~4 chars/token when the API omits it), the `Model` used, and one `Tool` node per unique tool called. The graph is persisted to `token_graph.json` on each save. The `/tokens` command queries the graph to show per-session and all-time totals.

### Authentication

Requires `API_KEY` in the environment (your OpenAI or compatible API key). See `.env.example`. The setup wizard prompts for it if not set. Set `BASE_URL` to point at any OpenAI-compatible endpoint (defaults to `https://api.openai.com/v1`).

### Model selection

At startup, CLIC fetches the live model list from the configured API endpoint via `fetchAvailableModelOptions()` (in `src/tools/listModelfromOpenAI.ts`) and presents it as an interactive picker. Pass `--model <name>` to skip the picker. The `/model` command reloads the list mid-session.

### Role/Knowledge Base system

Markdown files placed in `roles based Workflow/` are auto-discovered at startup and presented as selectable personas. The selected file's content is injected into the system prompt verbatim after a separator block. Pass `--kb <path>` to skip the interactive selector.

### REPL notes

- A fresh `readline` interface is created per prompt to avoid input-drop bugs during streaming.
- A `setInterval` keepalive prevents Node.js from exiting when streaming unrefs stdin.
- Chat history auto-saves to `chat_history.json` after every turn and on `/exit`.
- Token graph auto-saves to `token_graph.json` after every turn and on `/exit`.
- `--yolo` flag skips all `confirm()` prompts in both REPL and single-turn modes.

### Generated files (gitignored)

| File | Description |
|---|---|
| `chat_history.json` | Persisted `ChatMessage[]` conversation history |
| `token_graph.json` | Knowledge Graph of token usage across all sessions |
| `.env` | Local environment variables (API keys) |
| `dist/` | Compiled production output |
| `*.bak` | Backup files created by the `modify_file` tool |
