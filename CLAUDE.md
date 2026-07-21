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
      → single tool call: executed directly with confirm()
      → multiple tool calls: user prompted "Run all N tools in parallel?"
          yes → all calls run concurrently via Promise.all (auto-approve individual confirms)
          no  → calls run one-by-one sequentially, each with its own confirm()
      → individual tool modules (readFile, writeFile, runCommand, …)
    → knowledgeGraph.ts (record turn: tokens, model, tools used)
    → pricing.ts        (getCost — used by /tokens to display estimated spend)
    → messages pushed back, loop repeats until no more tool_calls
```

### Key files

| File | Role |
|---|---|
| `src/index.ts` | Entry point: CLI parsing (`commander`), setup wizard (`@clack/prompts`), live model picker, REPL loop |
| `src/agent.ts` | ReAct loop — iterates until LLM returns no tool calls or `maxSteps` is reached; when >1 tool call arrives, asks user "parallel or sequential?" — parallel runs all via `Promise.all`, sequential runs one-by-one with individual confirms; supports `AbortSignal` for mid-run cancellation; records each turn in KG |
| `src/openai.ts` | OpenAI SDK wrapper; `createClient()` + `streamMessage()`, assembles streaming tool-call chunks, wraps API call in `withRetry()` (exponential backoff on 429/5xx), accepts optional `AbortSignal`, returns `LLMResponse` with `TokenUsage` |
| `src/memory.ts` | In-memory `ChatMessage[]` store (OpenAI message format) + JSON persistence to `chat_history.json`; exports `pushMessage`, `getMessages`, `popMessage`, `clearMessages`, `messageCount`, `loadHistory`, `saveHistory`, `trimToLastUserMessage` |
| `src/knowledgeGraph.ts` | Token-tracking Knowledge Graph (session → turn → model/tools/usage); persisted to `token_graph.json`; exports `addNode`, `addEdge`, `getGraph`, `getNodeById`, `getNeighbors`, `getAllSessionNodes`, `getSessionTokenSummary`, `getGlobalTokenSummary`, `getSessionToolUsage`, `getSessionTokensByModel`, `getGlobalTokensByModel`, `loadGraph`, `saveGraph` |
| `src/pricing.ts` | Model pricing data loader; exports `loadPricing`, `getCost`, `formatCost`, `isPricingLoaded` — used by `/tokens` to show estimated USD cost per session and all-time |
| `src/prompts.ts` | Builds the system prompt with live system context (OS, user, CWD, date), optionally injecting a knowledge base block |
| `src/config.ts` | Loads `.env` via dotenv; exports constants (`DEFAULT_MODEL`, `DEFAULT_MAX_STEPS`, `HISTORY_FILE`, `TOKEN_GRAPH_FILE`), `AppConfig` interface, and `loadKnowledgeBase()` helper |
| `src/ui.ts` | All terminal rendering: animated banner, box-drawing, tool headers, status panel; exports `printBanner`, `printHelp`, `printStatus`, `printStepHeader`, `printSeparator`, `promptPrintSeperator`, `printToolHeader`, `printToolSuccess`, `printToolError`, `printToolBlocked`, `printRejected`, `printDimOutput`, `actionLabel` |
| `src/safety.ts` | `isCommandSafe()` (blocked patterns) + `isPathSafe()` (protected paths) |
| `src/tools/index.ts` | Tool registry — maps name → module, exposes `getToolDefinitions()`, `executeTool()`, `getToolNames()` |
| `src/tools/types.ts` | Shared tool types: `ConfirmFn`, `ToolResult`, `ToolDefinition` |
| `src/tools/helpers.ts` | Shared utility: `resolvePath()` (handles `~` expansion + `path.resolve`) |
| `src/tools/listModelfromOpenAI.ts` | `fetchAvailableModelOptions()` startup helper + `list_models` execute function; **not** registered in tool registry |
| `src/commands/index.ts` | Command registry — maps slash command name → module, exposes `executeCommand()`, `isSlashedCommand()`, `getSlashCommands()`, `slashCompleter()` |
| `src/commands/types.ts` | Shared types: `SlashCommand`, `CommandContext` (includes `sessionId`, `callLLM`), `CommandAction` |

### Tool system

Each tool is a self-contained module that exports:
- `definition: ToolDefinition` — name, description, JSON Schema parameters (sent to LLM)
- `execute(input, confirm)` — runs the action, calls `confirm()` before destructive ops

Registered tools: `read_file`, `write_file`, `append_file`, `modify_file`, `list_directory`, `run_command`, `search_files`, `web_search`, `github`.

Note: `list_models` is implemented in `src/tools/listModelfromOpenAI.ts` but is **not** registered in the tool registry — it is only used as a startup helper via `fetchAvailableModelOptions()`.

**`web_search` implementation note:** despite the name, this tool does **not** call an external search API (Brave/Tavily). It routes the query to the active LLM via a fresh OpenAI client call using `process.env.CLIC_MODEL`. It reads `CLIC_MODEL`, `API_KEY`, and `BASE_URL` from the environment at call time.

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

`src/knowledgeGraph.ts` maintains an in-memory graph with five node types and four edge types:

```
Session -[HAS_TURN]->   Turn
Turn    -[USED_MODEL]-> Model       (singleton per model name)
Turn    -[CALLED_TOOL]-> Tool       (singleton per tool name, one edge per unique tool per turn)
Turn    -[HAS_USAGE]->  TokenUsage  { promptTokens, completionTokens, totalTokens, source: "actual"|"estimated" }
```

Node types: `session`, `turn`, `model`, `tool`, `token_usage`
Edge types: `HAS_TURN`, `USED_MODEL`, `CALLED_TOOL`, `HAS_USAGE`

After every agent turn, `agent.ts` writes a `Turn` node with its `TokenUsage` (actual from API, or estimated at ~4 chars/token when the API omits it), the `Model` used, and one `Tool` node per unique tool called. The graph is persisted to `token_graph.json` on each save. The `/tokens` command queries the graph to show per-session and all-time totals, and uses `src/pricing.ts` to compute estimated USD cost per model.

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
- `AgentOptions.signal?: AbortSignal` — pass an `AbortController` signal to cancel a running agent turn mid-stream.
- `streamMessage` also accepts an optional `AbortSignal` and passes it to the OpenAI SDK `create()` call.
- `process.env.CLIC_MODEL` is kept in sync with the active model so tools can read it (e.g. `web_search`).
- When >1 tool call arrives in a single LLM response, the user is prompted **once**: "Run all N tools in parallel?" — `y` runs them concurrently via `Promise.all` (individual confirms auto-approved); `n` runs them sequentially with individual confirms.
- `src/openai.ts` wraps the API call in `withRetry()` — exponential backoff (1 s → 2 s → 4 s + jitter) on HTTP 429, 500, 502, 503, 504, up to 4 attempts.
- `src/pricing.ts` is loaded at startup via `loadPricing()`; the `/tokens` command calls `getCost(model, promptTokens, completionTokens)` to compute estimated USD spend per model and in total.

### Generated files (gitignored)

| File | Description |
|---|---|
| `chat_history.json` | Persisted `ChatMessage[]` conversation history |
| `token_graph.json` | Knowledge Graph of token usage across all sessions |
| `.env` | Local environment variables (API keys) |
| `dist/` | Compiled production output |
| `*.bak` | Backup files created by the `modify_file` tool |

### New source file (not in key files table above)

| File | Description |
|---|---|
| `src/pricing.ts` | Model pricing data — `loadPricing()`, `getCost(model, promptTokens, completionTokens)`, `formatCost(usd)`, `isPricingLoaded()` |
