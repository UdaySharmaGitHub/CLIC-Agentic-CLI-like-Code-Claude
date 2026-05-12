# CLIC — Command Line Intelligence Companion

> **v4.3** — An agentic CLI powered by any OpenAI-compatible API with streaming, function calling, and a modular tool system.


CLIC is a terminal-based Agentic CLI that can read/write files, run shell commands, search the web, and chain multiple steps automatically to complete complex tasks — all with human approval before every action.

---

![CLIC](./resources/images/CLIC%20v4.3.png)

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [High-Level Flow](#high-level-flow)
  - [ReAct Agent Loop](#react-agent-loop)
  - [Tool System](#tool-system)
  - [Module Responsibilities](#module-responsibilities)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [Interactive REPL](#interactive-repl)
  - [Single-Turn Mode](#single-turn-mode)
  - [CLI Flags](#cli-flags)
  - [REPL Commands](#repl-commands)
- [Adding a New Tool](#adding-a-new-tool)
- [Adding a New Command](#adding-a-new-command)
- [Knowledge Base](#knowledge-base)
- [Persistent Agent Memory](#persistent-agent-memory)
- [Safety](#safety)
- [Environment Variables](#environment-variables)

---

## Features

| Capability | Description |
|---|---|
| 💬 Chat / Q&A | Any topic — code, math, devops, science |
| ⚙️ Run Commands | Execute safe shell commands with approval |
| 📖 Read Files | Read and analyze file contents |
| ✏️ Write Files | Create or overwrite files |
| ➕ Append Files | Add content to existing files |
| 🔧 Modify Files | Find-and-replace text in files (with backup) |
| 📂 List Dirs | Browse directory listings |
| 🔍 Search Files | Glob-based file search |
| 🌐 Web Search | Real-time web search via Brave or Tavily API |
| 🐙 GitHub | Fetch any user's profile, activity streak, and public repos |
| 📋 List Models | Enumerate available models from the configured API endpoint |
| 🔗 Agentic Loop | Auto-chain multiple steps: plan → execute → verify |
| 📚 Knowledge Base | Load role/behavior/persona from a file |
| 🧠 Persistent Memory | Chat history saved to `chat_history.json` — agent remembers across sessions |
| 🛡️ Safety Layer | Blocked commands + protected paths + human approval |

---

## Tech Stack

| Package | Role |
|---|---|
| **`openai`** | OpenAI-compatible API client with streaming + function calling |
| **`commander`** | CLI argument parsing (`--model`, `--kb`, `--yolo`, etc.) |
| **`@clack/prompts`** | Interactive setup wizard (API key, model picker, KB file) |
| **`execa`** | Safe subprocess execution with timeout + error capture |
| **`fast-glob`** | Glob-based file search |
| **`chalk`** | Colored terminal output |
| **`ora`** | Spinner while waiting for LLM responses |
| **`dotenv`** | Load `.env` config (API keys) |
| **`tsx`** | Run TypeScript directly during development |
| **`tsup`** | Bundle for production distribution |

---

## Project Structure

```
clic/
├── src/
│   ├── index.ts              ← CLI entry point + REPL loop
│   ├── agent.ts              ← ReAct agentic loop (runAgentTurn)
│   ├── gemini.ts             ← OpenAI SDK wrapper (createClient / streamMessage)
│   ├── prompts.ts            ← System prompt builder (buildSystemPrompt)
│   ├── memory.ts             ← Chat history management (load/save/push/clear/trim)
│   ├── safety.ts             ← Blocked commands + protected paths
│   ├── config.ts             ← Environment loading, constants, KB loader
│   ├── ui.ts                 ← Banner, help, status, chalk formatters
│   ├── commands/
│   │   ├── index.ts          ← Command registry + router + tab completer
│   │   ├── types.ts          ← Shared types (SlashCommand, CommandContext, CommandAction)
│   │   ├── compact.ts        ← /compact — summarize + compress history
│   │   ├── model.ts          ← /model  — switch model mid-session
│   │   ├── role.ts           ← /role   — switch KB/persona mid-session
│   │   ├── undo.ts           ← /undo   — remove last exchange
│   │   ├── retry.ts          ← /retry  — regenerate last response
│   │   ├── tokens.ts         ← /tokens — estimate token usage
│   │   ├── status.ts         ← /status — show system info
│   │   ├── history.ts        ← /history — show conversation history
│   │   ├── clear.ts          ← /clear  — clear history
│   │   ├── raw.ts            ← /raw    — toggle debug output
│   │   ├── help.ts           ← /help   — show help menu
│   │   └── exit.ts           ← /exit   — quit agent
│   └── tools/
│       ├── index.ts          ← Tool registry + router
│       ├── types.ts          ← Shared types (ConfirmFn, ToolResult, ToolDefinition)
│       ├── helpers.ts        ← Shared helpers (resolvePath)
│       ├── readFile.ts       ← read_file tool
│       ├── writeFile.ts      ← write_file tool
│       ├── appendFile.ts     ← append_file tool
│       ├── modifyFile.ts     ← modify_file tool
│       ├── listDir.ts        ← list_directory tool
│       ├── runCommand.ts     ← run_command tool
│       ├── searchFiles.ts    ← search_files tool
│       ├── webSearch.ts      ← web_search tool (Brave / Tavily)
│       ├── githubExtractor.ts← github tool (profile, streak, repos)
│       └── listModelfromOpenAI.ts ← list_models tool + startup model fetcher
├── roles based Workflow/     ← Built-in role/persona files (auto-discovered)
├── .env                      ← API keys (not committed)
├── .env.example              ← Template for .env
├── .gitignore
├── package.json
├── tsconfig.json
├── setup.sh                  ← Original bash version (v4.1)
└── chat_history.json         ← Persisted conversation (auto-generated)
```

---

## Architecture

### High-Level Flow

```mermaid
flowchart TD
    User(["👤 User Input\nREPL / Single-turn"])
    index["index.ts\nCLI + REPL"]
    memory["memory.ts\nChat History"]
    agent["agent.ts\nReAct Loop"]
    gemini["gemini.ts\nOpenAI-compatible API"]
    cmdRegistry["commands/index.ts\nCommand Registry"]
    toolRegistry["tools/index.ts\nTool Registry"]

    compact["/compact\n/model · /role\n/undo · /retry\n/tokens · …"]
    readFile["read_file"]
    writeFile["write_file"]
    appendFile["append_file"]
    modifyFile["modify_file"]
    listDir["list_directory"]
    runCmd["run_command"]
    search["search_files"]
    webSearch["web_search"]
    github["github"]
    listModels["list_models"]

    User -->|"slash command"| index
    User -->|"natural language"| index
    index -->|"slash command"| cmdRegistry
    cmdRegistry --> compact
    compact -->|"update / retry / exit"| index
    index --> memory
    memory --> agent
    agent -->|"streamMessage()"| gemini
    gemini -->|"text + tool_calls (streaming)"| agent
    agent -->|"executeTool()"| toolRegistry
    toolRegistry --> readFile & writeFile & appendFile & modifyFile
    toolRegistry --> listDir & runCmd & search & webSearch
    toolRegistry --> github & listModels
    toolRegistry -->|"tool_result"| agent
    agent -->|"no more tool_calls → end_turn"| index
    index --> User
```

### ReAct Agent Loop

The core pattern is a **ReAct loop** (Reason + Act). This runs in `agent.ts`:

```mermaid
flowchart TD
    Start(["💬 User sends message"])
    SlashCheck{{"Slash\ncommand?"}}
    CmdRun["⌘ Execute command\n(/compact · /model · /role\n/undo · /tokens · …)"]
    RetryPath["🔄 /retry — trim last\nassistant turn, re-enter loop"]
    CallAPI["⚙️ Call SAP AI Core\n— streaming response —"]
    Decision{{"stop_reason?"}}
    EndTurn(["✅ end_turn\nReturn response to user"])
    ToolUse["🔧 tool_use\nExecute tool(s)\nwith user approval"]
    SaveResult["📩 Push tool_result\nback into context"]
    StepCheck{{"Max steps\nreached?"}}
    Abort(["⛔ Abort\nMax steps exceeded"])

    Start --> SlashCheck
    SlashCheck -->|"yes"| CmdRun
    SlashCheck -->|"no"| CallAPI
    CmdRun -->|"retry action"| RetryPath
    CmdRun -->|"continue / update / exit"| Start
    RetryPath --> CallAPI
    CallAPI --> Decision
    Decision -->|"end_turn"| EndTurn
    Decision -->|"tool_use"| ToolUse
    ToolUse --> SaveResult
    SaveResult --> StepCheck
    StepCheck -->|"No"| CallAPI
    StepCheck -->|"Yes"| Abort
```

**Key design**: The `openai` SDK's native streaming + function calling handles structured tool calls — no manual JSON parsing or `done` flag needed. The absence of further function calls naturally signals when the agent is finished.

**Step limit**: Max 15 steps per user turn (configurable via `--max-steps`).

### Tool System

Every tool is a self-contained module that exports two things:

```typescript
// src/tools/myTool.ts

export const definition: ToolDefinition = {
  name: 'my_tool',
  description: '...',
  parameters: { type: 'object', properties: { ... }, required: [] },
};

export async function execute(
  input: { /* typed input */ },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  // 1. Print header
  // 2. Safety check (if applicable)
  // 3. Ask for user confirmation
  // 4. Execute the action
  // 5. Return { output, isError }
}
```

The **registry** (`tools/index.ts`) auto-wires everything:

```
tools/index.ts
  ├── Imports all tool modules
  ├── Builds toolMap (name → module)
  ├── getToolDefinitions() → JSON schemas sent to the LLM
  └── executeTool(name, input, confirm) → routes to correct module
```

Registered tools:

| Tool | Module | Description |
|---|---|---|
| `read_file` | `readFile.ts` | Read file contents |
| `write_file` | `writeFile.ts` | Create or overwrite a file |
| `append_file` | `appendFile.ts` | Append to an existing file |
| `modify_file` | `modifyFile.ts` | Find-and-replace in a file |
| `list_directory` | `listDir.ts` | List directory contents |
| `run_command` | `runCommand.ts` | Execute a shell command |
| `search_files` | `searchFiles.ts` | Glob-based file search |
| `web_search` | `webSearch.ts` | Web search via Brave or Tavily |
| `github` | `githubExtractor.ts` | GitHub profile, streak, and repos |
| `list_models` | `listModelfromOpenAI.ts` | List models from configured API |

### Module Responsibilities

| Module | Purpose |
|---|---|
| **`index.ts`** | CLI parsing, setup wizard, live model picker, REPL loop. Passes extended `CommandContext` (with `callLLM`, `systemPrompt`) to commands; handles `retry` and `update` actions (recreates OpenAI client on model swap) |
| **`agent.ts`** | The ReAct loop — calls the API via the OpenAI client, handles streaming, executes tools, feeds results back, loops until done or max steps |
| **`gemini.ts`** | Thin wrapper around `openai` — `createClient()` + `streamMessage()` with tool-call chunk assembly |
| **`prompts.ts`** | Builds the system prompt with live system context (OS, user, CWD, date) + optional knowledge base |
| **`memory.ts`** | Manages `ChatMessage[]` in memory (OpenAI format) — `pushMessage()`, `getMessages()`, `clearMessages()`, `loadHistory()`, `saveHistory()`, `trimToLastUserMessage()` |
| **`config.ts`** | Loads `.env`, exports constants (`DEFAULT_MODEL`, `DEFAULT_MAX_STEPS`, `HISTORY_FILE`), loads KB files |
| **`safety.ts`** | `isCommandSafe()` checks against blocked patterns, `isPathSafe()` checks against protected paths |
| **`ui.ts`** | `printBanner()`, `printHelp()`, `printStatus()`, `actionLabel()`, `printToolHeader()`, `printDimOutput()`, etc. |
| **`commands/types.ts`** | Shared types: `SlashCommand`, `CommandContext` (with `callLLM` callback), `CommandAction` (`continue`/`exit`/`retry`/`update`) |
| **`commands/index.ts`** | Registry: imports all commands, supports `args` parsing (e.g. `/model gpt-4o`), exports `executeCommand()` + `slashCompleter()` |
| **`tools/types.ts`** | Shared types: `ConfirmFn`, `ToolResult`, `ToolDefinition` |
| **`tools/helpers.ts`** | Shared utility: `resolvePath()` (handles `~` expansion + `path.resolve`) |
| **`tools/index.ts`** | Registry: imports all tools, builds lookup map, exports `getToolDefinitions()` + `executeTool()` |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended) or npm

### Install

```bash
git clone <repo-url> clic
cd clic
pnpm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
API_KEY=sk-...

# Optional: point at any OpenAI-compatible endpoint
BASE_URL=https://api.openai.com/v1

# Optional: for web search
BRAVE_API_KEY=BSA...
# OR
TAVILY_API_KEY=tvly-...
```

If you don't set `API_KEY` in `.env`, the setup wizard will prompt you interactively.

### Run

```bash
# Development (with hot reload via tsx)
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

---

## Usage

### Interactive REPL

```bash
pnpm dev
```

This launches the setup wizard (API key + optional knowledge base), then drops you into the REPL:

```
  🧑 You:
  > create a hello.ts file, make it executable, and run it
```

The agent will chain multiple steps automatically:
1. `write_file` → create hello.ts
2. `run_command` → chmod +x hello.ts
3. `run_command` → ./hello.ts
4. `respond` → summarize what was done

Every action requires **your approval** before execution.

### Single-Turn Mode

```bash
pnpm dev -- "list all TypeScript files in src/"
```

Runs the prompt, outputs the result, and exits.

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--model <model>` | `gpt-4o` | Model to use (see live picker at startup) |
| `--kb <path>` | — | Path to a knowledge base / role file |
| `--max-steps <n>` | `15` | Max agent steps per user turn |
| `--yolo` | `false` | Auto-approve all actions (skip confirmations) |

#### Available Models

Models are fetched live from your configured API endpoint at startup and presented as an interactive picker. Pass `--model <name>` to bypass it. Use `/model` mid-session to switch without restarting.

| Model ID | Provider |
|---|---|
| `anthropic--claude-4-sonnet` | Anthropic (SAP AI Core) |
| `anthropic--claude-4.5-haiku` | Anthropic |
| `anthropic--claude-4.5-opus` | Anthropic |
| `anthropic--claude-4.5-sonnet` | Anthropic |
| `anthropic--claude-4.6-opus` | Anthropic |
| `anthropic--claude-4.6-sonnet` | Anthropic |
| `gemini-2.5-flash` | Google |
| `gemini-2.5-flash-lite` | Google |
| `gemini-2.5-pro` | Google |
| `gpt-4.1` | OpenAI |
| `gpt-4.1-mini` | OpenAI |
| `gpt-5` | OpenAI |
| `gpt-5-mini` | OpenAI |
| `sonar` | Perplexity |
| `sonar-pro` | Perplexity |

```bash
# Example: use Claude Sonnet
pnpm dev -- --model anthropic--claude-4.6-sonnet

# Example: use GPT-5
pnpm dev -- --model gpt-5

# Example: use Gemini 2.5 Pro
pnpm dev -- --model gemini-2.5-pro
```

### REPL Commands

| Command | Alias | Action |
|---|---|---|
| `/compact` | — | Summarize + compress history to free up context |
| `/model [name]` | `/m` | Switch LLM model mid-session (shows picker if no name given) |
| `/role` | — | Switch knowledge base / persona without restarting |
| `/undo` | — | Remove the last user + assistant exchange from history |
| `/retry` | `/r` | Regenerate the last response (re-runs last user message) |
| `/tokens` | — | Show estimated token usage for the current conversation |
| `/status` | — | Show system info (OS, model, history count, etc.) |
| `/history` | — | Show conversation history |
| `/clear` | — | Clear conversation history |
| `/raw` | — | Toggle raw JSON debug output |
| `/help` | — | Show capabilities and example prompts |
| `/exit` / `/quit` | — | Save history and exit |

---

## Adding a New Tool

The tool system is designed for easy extension. Two steps:

### Step 1: Create the tool module

Create `src/tools/myNewTool.ts`:

```typescript
import type { ToolDefinition, ConfirmFn, ToolResult } from './types.js';

// 1. Define the JSON schema (sent to the LLM)
export const definition: ToolDefinition = {
  name: 'my_new_tool',
  description: 'What this tool does — the LLM reads this to decide when to use it.',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description for the model' },
      param2: { type: 'number', description: 'Another param' },
    },
    required: ['param1'],
  },
};

// 2. Implement the executor
export async function execute(
  input: { param1: string; param2?: number },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  // Ask for approval
  if (!await confirm(`Run my_new_tool with '${input.param1}'?`)) {
    return { output: 'User rejected.', isError: true };
  }

  // Do the work
  const result = `Did something with ${input.param1}`;

  return { output: result, isError: false };
}
```

### Step 2: Register it

In `src/tools/index.ts`, add two lines:

```typescript
import * as myNewTool from './myNewTool.js';    // ← add import

const tools: ToolModule[] = [
  readFile,
  writeFile,
  // ... existing tools ...
  myNewTool,                                     // ← add to array
];
```

That's it. The registry auto-wires the definition (sent to the LLM) and the executor (called when the LLM uses it).

---

## Adding a New Command

Slash commands are self-contained modules. Two steps:

### Step 1: Create the command module

Create `src/commands/myCmd.ts`:

```typescript
import chalk from 'chalk';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/mycmd',
  aliases: ['/mc'],            // optional
  description: 'What this command does',
  usage: '/mycmd [optional-arg]',
  execute: async (ctx, args) => {
    // ctx: { model, maxSteps, showRaw, kbFile, systemPrompt, yolo, callLLM }
    // args: everything after the command name (e.g. "gpt-4o" from "/mycmd gpt-4o")

    console.log(chalk.green(`  ✅ Running mycmd, current model: ${ctx.model}`));
    console.log();

    // Return one of:
    //   { type: 'continue' }                           — nothing changes
    //   { type: 'exit' }                               — quit the REPL
    //   { type: 'retry' }                              — re-run last user message
    //   { type: 'update', updates: { model: '...' } }  — mutate session state
    return { type: 'continue' };
  },
};
```

### Step 2: Register it

In `src/commands/index.ts`, add two lines:

```typescript
import { command as myCmdCmd } from './myCmd.js';  // ← add import

const commands: SlashCommand[] = [
  // ... existing commands ...
  myCmdCmd,                                         // ← add to array
];
```

Tab-completion, routing, and `/help` all pick it up automatically.

---

## Knowledge Base

You can customize the agent's persona by loading a knowledge base file:

```bash
pnpm dev -- --kb "./roles based Workflow/devops-expert.md"
```

Or select a role during the setup wizard — CLIC auto-discovers any `.md` files in the `roles based Workflow/` folder and presents them as a menu.

The file contents are appended to the system prompt as a "ROLE & KNOWLEDGE BASE" section. The agent will adopt the role while retaining all tool capabilities.

Example KB file (`roles based Workflow/devops-expert.md`):

```markdown
You are a senior DevOps engineer specializing in AWS, Kubernetes, and CI/CD.
Always suggest infrastructure-as-code approaches.
Prefer Terraform over CloudFormation.
When troubleshooting, check logs first, then configs.
```

---

## Persistent Agent Memory

CLIC maintains a **persistent, session-spanning memory** — built entirely from scratch with no third-party memory or vector-store library.

### How it works

Every conversation turn (user message + assistant response + tool calls/results) is serialised and saved to `chat_history.json` as a flat array of **OpenAI-compatible messages**. On the next session, the agent loads this array and injects it into the context window before processing your first message — so it already knows what you worked on, what decisions were made, and what files were touched.

```
chat_history.json  ←  OpenAI ChatMessage[]
[
  { role: "user",      content: "..." },
  { role: "assistant", content: "...", tool_calls: [...] },
  { role: "tool",      content: "...", tool_call_id: "..." },
  ...
]
```

### Key properties

| Property | Detail |
|---|---|
| **Zero dependencies** | Pure Node.js `fs` + `JSON` — no LangChain, no vector DB, no external memory service |
| **Survives restarts** | History written to disk after every turn and on `/exit` |
| **Full context replay** | Entire message array injected back into the context window on startup |
| **Selective clear** | Use `/clear` in the REPL to wipe memory and start a fresh session |
| **Configurable path** | Override the default file via `AGENT_HISTORY_FILE` env var |

### Result

The agent remembers previous tasks, code it wrote, commands it ran, and conclusions it reached — across any number of sessions — without you having to re-explain context each time.

```
Session 1:  "Create a FastAPI server in server.py"
            → agent writes server.py, saves memory

Session 2:  "Add authentication to the server"
            → agent already knows server.py exists and what's in it
            → picks up exactly where it left off
```

---

## Safety

### Blocked Commands

The following patterns are blocked and will never execute:

```
rm -rf /    rm -rf /*    mkfs          dd if=
:(){:|:&};: fork bomb    > /dev/sda    chmod -R 777 /
shutdown    reboot       halt          init 0 / init 6
kill -9 1   mv /*        curl | bash   poweroff
```

### Protected Paths

File operations are denied on:

```
/etc/passwd   /etc/shadow   /etc/sudoers   /etc/hosts
/boot/        /dev/         /proc/         /sys/
/var/log/auth
```

### Human Approval

Every tool action (read, write, command, search, etc.) requires explicit `y/n` confirmation before execution. Use `--yolo` to skip confirmations (use with caution).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `API_KEY` | Yes* | Your OpenAI or compatible API key (prompted interactively if missing) |
| `BASE_URL` | No | OpenAI-compatible endpoint base URL (default: `https://api.openai.com/v1`) |
| `BRAVE_API_KEY` | No | Brave Search API key (for `web_search` tool) |
| `TAVILY_API_KEY` | No | Tavily API key (alternative to Brave for `web_search`) |
| `AGENT_HISTORY_FILE` | No | Custom path for chat history (default: `chat_history.json`) |

---

## Evolution

CLIC started as a pure Bash script (`setup.sh`) powered by Google Gemini, then migrated to SAP AI Core Orchestration Service, and is now a provider-agnostic OpenAI-compatible client:

| Bash v4.1 (Gemini) | TypeScript v4.2 (SAP AI Core) | TypeScript v4.3 (OpenAI-compatible) |
|---|---|---|
| Manual JSON parsing + `done` flag | Native SAP SDK function calling | Native `openai` SDK streaming + tool calls |
| `jq` + `curl` for API calls | `@sap-ai-sdk/orchestration` | `openai` npm package |
| Hardcoded Gemini endpoint | SAP AI Core Orchestration | Any OpenAI-compatible endpoint |
| `eval` for shell commands | `execa` with timeout | `execa` with timeout |
| Monolithic single file | 18-file modular architecture | 20-file modular architecture + 2 new tools |
| Google Search grounding | Brave / Tavily web search | Brave / Tavily + GitHub + list_models |

---

## License

MIT
