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

CLIC is a Node.js CLI tool (ESM, TypeScript) built around a **ReAct agentic loop** powered by the **SAP AI SDK Orchestration Service** (`@sap-ai-sdk/orchestration`). Despite the naming, `gemini.ts` wraps the SAP SDK — it is not a Google Gemini client.

### Request flow

```
User input (REPL or single-turn)
  → memory.ts   (pushMessage → getMessages)
  → agent.ts    (runAgentTurn)
    → gemini.ts (streamMessage via OrchestrationClient)
      ← LLM responds: text + optional tool_calls
    → tools/index.ts (executeTool dispatcher)
      → individual tool modules (readFile, writeFile, runCommand, …)
    → messages pushed back, loop repeats until no more tool_calls
```

### Key files

| File | Role |
|---|---|
| `src/index.ts` | Entry point: CLI parsing (`commander`), setup wizard (`@clack/prompts`), REPL loop |
| `src/agent.ts` | ReAct loop — iterates until LLM returns no tool calls or `maxSteps` is reached |
| `src/gemini.ts` | SAP SDK `OrchestrationClient` wrapper; handles streaming + tool-call chunk assembly |
| `src/memory.ts` | In-memory `ChatMessage[]` store + JSON persistence to `chat_history.json` |
| `src/prompts.ts` | Builds the system prompt, optionally injecting a knowledge base file |
| `src/config.ts` | Loads `.env`, exports constants (`DEFAULT_MODEL = 'gpt-4o'`, `DEFAULT_MAX_STEPS = 15`) |
| `src/ui.ts` | All terminal rendering: animated banner, box-drawing, tool headers, status panel |
| `src/tools/index.ts` | Tool registry — maps name → module, exposes `getToolDefinitions()` + `executeTool()` |
| `src/commands/index.ts` | Command registry — maps slash command name → module, exposes `executeCommand()` + `slashCompleter()` |
| `src/commands/types.ts` | Shared types: `SlashCommand`, `CommandContext`, `CommandAction` |

### Tool system

Each tool is a self-contained module that exports:
- `definition: ToolDefinition` — name, description, JSON Schema parameters (sent to LLM)
- `execute(input, confirm)` — runs the action, calls `confirm()` before destructive ops

Registered tools: `read_file`, `write_file`, `append_file`, `modify_file`, `list_directory`, `run_command`, `search_files`, `web_search`.

**To add a new tool:** create `src/tools/myTool.ts` with `definition` and `execute`, then import and add it to the `tools` array in `src/tools/index.ts`.

### Command system

Each slash command is a self-contained module that exports `command: SlashCommand` with:
- `name` — the slash string (e.g. `/compact`), optional `aliases` (e.g. `['/r']`)
- `description` / `usage` — shown in `/help`
- `execute(ctx: CommandContext, args?: string) → Promise<CommandAction>`

`CommandContext` carries: `model`, `maxSteps`, `showRaw`, `kbFile`, `systemPrompt`, `yolo`, and `callLLM` (a single-shot LLM callback used by `/compact`).

`CommandAction` can be: `continue`, `exit`, `retry`, or `update` (with a `Partial<CommandContext>` payload). When `model` changes via `update`, `index.ts` automatically recreates the `OrchestrationClient`.

Registered commands: `/compact`, `/model` (alias `/m`), `/role`, `/undo`, `/retry` (alias `/r`), `/tokens`, `/status`, `/history`, `/clear`, `/raw`, `/help`, `/exit`.

**To add a new command:** create `src/commands/myCommand.ts` exporting `command: SlashCommand`, then import and add it to the `commands` array in `src/commands/index.ts`.

### Authentication

Requires `AICORE_SERVICE_KEY` in the environment (JSON string from an SAP AI Core service instance). See `.env.example`. The setup wizard prompts for it if not set. The same key is used by both the main agent and the `web_search` tool.

### Role/Knowledge Base system

Markdown files placed in `roles based Workflow/` are auto-discovered at startup and presented as selectable personas. The selected file's content is injected into the system prompt verbatim after a separator block. Pass `--kb <path>` to skip the interactive selector.

### REPL notes

- A fresh `readline` interface is created per prompt to avoid input-drop bugs during streaming.
- A `setInterval` keepalive prevents Node.js from exiting when streaming unrefs stdin.
- Chat history auto-saves to `chat_history.json` after every turn and on `/exit`.
- `--yolo` flag skips all `confirm()` prompts in both REPL and single-turn modes.
