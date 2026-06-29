# CLIC — Command Line Intelligence Companion

> **v4.3** — An agentic CLI powered by any OpenAI-compatible API with streaming, function calling, parallel tool execution, abort support, and a modular tool system.
>
> **Note:** `package.json` currently reports `4.2.0` — see [Feature Optimization #40](./Feature%20Optimization.md) for the version sync fix.


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
| 🌐 Web Search | Real-time web search (Brave / Tavily API; falls back to LLM if no key set) |
| 🐙 GitHub | Fetch any user's profile, activity streak, and public repos |
| 📋 Model Picker | Live model list fetched from API at startup; switch mid-session with `/model` |
| 🔗 Agentic Loop | Auto-chain multiple steps: plan → execute → verify |
| ⚡ Parallel Tools | Independent tool calls in the same LLM response run concurrently via `Promise.all` |
| ⛔ Abort Support | `AbortSignal` threading lets you cancel a running agent turn mid-stream |
| 📚 Knowledge Base | Load role/behavior/persona from a Markdown file |
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
│   ├── agent.ts              ← ReAct agentic loop (runAgentTurn) + KG recording
│   ├── openai.ts             ← OpenAI SDK wrapper (createClient / streamMessage / TokenUsage)
│   ├── knowledgeGraph.ts     ← Token-tracking Knowledge Graph (persisted to token_graph.json)
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
│   │   ├── tokens.ts         ← /tokens — actual token counts from Knowledge Graph
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
│       └── listModelfromOpenAI.ts ← fetchAvailableModelOptions() startup helper (not in tool registry)
├── roles based Workflow/     ← Built-in role/persona files (auto-discovered)
├── .env                      ← API keys (not committed)
├── .env.example              ← Template for .env
├── .gitignore
├── package.json
├── tsconfig.json
├── setup.sh                  ← Original bash version (v4.1)
├── chat_history.json         ← Persisted conversation (auto-generated, gitignored)
└── token_graph.json          ← Token usage Knowledge Graph (auto-generated, gitignored)
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
    llm["openai.ts\nOpenAI-compatible API"]
    kg["knowledgeGraph.ts\nToken KG"]
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
    agent -->|"streamMessage()"| llm
    llm -->|"text + tool_calls + TokenUsage"| agent
    agent -->|"executeTool()"| toolRegistry
    toolRegistry --> readFile & writeFile & appendFile & modifyFile
    toolRegistry --> listDir & runCmd & search & webSearch
    toolRegistry --> github & listModels
    toolRegistry -->|"tool_result"| agent
    agent -->|"record turn"| kg
    agent -->|"no more tool_calls → end_turn"| index
    index --> User

    classDef user      fill:#7C3AED,stroke:#5B21B6,color:#fff,font-weight:bold
    classDef core      fill:#1D4ED8,stroke:#1E40AF,color:#fff
    classDef llmNode   fill:#0D9488,stroke:#0F766E,color:#fff,font-weight:bold
    classDef kgNode    fill:#D97706,stroke:#B45309,color:#fff,font-weight:bold
    classDef cmdNode   fill:#7E22CE,stroke:#6B21A8,color:#fff
    classDef registry  fill:#0369A1,stroke:#075985,color:#fff,font-weight:bold
    classDef toolItem  fill:#059669,stroke:#047857,color:#fff

    class User user
    class index,memory,agent core
    class llm llmNode
    class kg kgNode
    class cmdRegistry,compact cmdNode
    class toolRegistry registry
    class readFile,writeFile,appendFile,modifyFile,listDir,runCmd,search,webSearch,github,listModels toolItem

    linkStyle default stroke:#ffffff,stroke-width:1.5px
```

### ReAct Agent Loop

The core pattern is a **ReAct loop** (Reason + Act). This runs in `agent.ts`:

<div align="center">

```mermaid
flowchart TD
    Start(["💬 User sends message"])
    SlashCheck{{"Slash\ncommand?"}}
    CmdRun["⌘ Execute command\n(/compact · /model · /role\n/undo · /tokens · …)"]
    RetryPath["🔄 /retry — trim last\nassistant turn, re-enter loop"]
    CallAPI["⚙️ Call OpenAI-compatible API\n— streaming response —"]
    Decision{{"tool_calls?"}}
    EndTurn(["✅ end_turn\nRecord turn in KG\nReturn response to user"])
    ToolUse["🔧 Execute tool(s) in parallel\nPromise.all — with user approval"]
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
    Decision -->|"no"| EndTurn
    Decision -->|"yes"| ToolUse
    ToolUse --> SaveResult
    SaveResult --> StepCheck
    StepCheck -->|"No"| CallAPI
    StepCheck -->|"Yes"| Abort

    classDef startEnd  fill:#7C3AED,stroke:#5B21B6,color:#fff,font-weight:bold
    classDef decision  fill:#D97706,stroke:#B45309,color:#fff,font-weight:bold
    classDef command   fill:#7E22CE,stroke:#6B21A8,color:#fff
    classDef apiCall   fill:#0D9488,stroke:#0F766E,color:#fff,font-weight:bold
    classDef toolExec  fill:#059669,stroke:#047857,color:#fff
    classDef success   fill:#1D4ED8,stroke:#1E40AF,color:#fff,font-weight:bold
    classDef abort     fill:#DC2626,stroke:#B91C1C,color:#fff,font-weight:bold
    classDef neutral   fill:#374151,stroke:#1F2937,color:#fff

    class Start,EndTurn startEnd
    class SlashCheck,Decision,StepCheck decision
    class CmdRun,RetryPath command
    class CallAPI apiCall
    class ToolUse,SaveResult toolExec
    class EndTurn success
    class Abort abort

    linkStyle default stroke:#ffffff,stroke-width:1.5px
```

</div>

**Key design**: The `openai` SDK's native streaming + function calling handles structured tool calls — no manual JSON parsing or `done` flag needed. When the LLM emits multiple tool calls in a single response, they are executed **concurrently** via `Promise.all` — each tool runs at the same time, results are collected, then pushed back into context together. The absence of further function calls naturally signals when the agent is finished.

**Parallel tool execution**: Independent tool calls in the same LLM response (e.g. `read_file` + `web_search`) run simultaneously. Dependent calls are handled naturally by the loop — the LLM issues them across separate turns, each turn waiting for all results before the next API call.

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

> `list_models` (`listModelfromOpenAI.ts`) is a startup-only helper — it powers the interactive model picker but is **not** registered in the LLM tool registry.

### Module Responsibilities

| Module | Purpose |
|---|---|
| **`index.ts`** | CLI parsing, setup wizard, live model picker, REPL loop. Passes extended `CommandContext` (with `callLLM`, `systemPrompt`, `sessionId`) to commands; handles `retry` and `update` actions (recreates OpenAI client on model swap) |
| **`agent.ts`** | The ReAct loop — calls the API via `openai.ts`, handles streaming, executes all tool calls in a single LLM response **in parallel** via `Promise.all`, feeds results back, loops until done or max steps. Accepts an optional `AbortSignal` (`AgentOptions.signal`) to support mid-run cancellation. After each turn records session/turn/model/tool/usage nodes in the Knowledge Graph |
| **`openai.ts`** | Thin wrapper around `openai` — `createClient()` + `streamMessage()` with tool-call chunk assembly. Accepts an optional `AbortSignal` passed through to the SDK's `create()` call. Returns `LLMResponse` including `TokenUsage` (actual from `stream_options.include_usage`) |
| **`knowledgeGraph.ts`** | In-memory graph with `addNode()` / `addEdge()` / query helpers (`getSessionTokenSummary`, `getGlobalTokenSummary`, `getSessionToolUsage`). Persisted to `token_graph.json` |
| **`prompts.ts`** | Builds the system prompt with live system context (OS, user, CWD, date) + optional knowledge base |
| **`memory.ts`** | Manages `ChatMessage[]` in memory (OpenAI format) — `pushMessage()`, `getMessages()`, `clearMessages()`, `loadHistory()`, `saveHistory()`, `trimToLastUserMessage()` |
| **`config.ts`** | Loads `.env`, exports constants (`DEFAULT_MODEL`, `DEFAULT_MAX_STEPS`, `HISTORY_FILE`, `TOKEN_GRAPH_FILE`), loads KB files |
| **`safety.ts`** | `isCommandSafe()` checks against blocked patterns, `isPathSafe()` checks against protected paths |
| **`ui.ts`** | `printBanner()`, `printHelp()`, `printStatus()`, `printStepHeader()`, `printSeparator()`, `promptPrintSeperator()`, `printToolHeader()`, `printToolSuccess()`, `printToolError()`, `printToolBlocked()`, `printRejected()`, `printDimOutput()`, `actionLabel()` |
| **`commands/types.ts`** | Shared types: `SlashCommand`, `CommandContext` (with `callLLM` + `sessionId`), `CommandAction` (`continue`/`exit`/`retry`/`update`) |
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
| `anthropic--claude-4-sonnet` | Anthropic |
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
| `/tokens` | — | Show actual token usage (from Knowledge Graph) + context size estimate |
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

Built-in roles available:

| File | Persona |
|---|---|
| `AI_Engineer.md` | AI Engineer |
| `Gen_AI_Engineer.md` | Generative AI Engineer |
| `genz_workflow.md` | Gen-Z Communication Style |
| `Legal_Software_Advocate.md` | Legal Software Advocate |
| `Machine_Learning_Engineer.md` | Machine Learning Engineer |
| `Multi_Language_Teacher.md` | Multi-Language Teacher |
| `Senior_Devops_Engineer.md` | Senior DevOps Engineer |
| `SRE_Engineer.md` | Site Reliability Engineer |
| `TestCase_Fixer_&_Error_Resolution_Specialist.md` | Test Case Fixer & Error Resolution Specialist |

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

CLIC maintains two independent persistence stores — both built without any third-party memory or vector-store library.

### Chat History (`chat_history.json`)

Every conversation turn (user message + assistant response + tool calls/results) is serialised and saved as a flat array of **OpenAI-compatible messages**. On the next session, the agent loads this array and injects it into the context window before processing your first message.

```
chat_history.json  ←  OpenAI ChatMessage[]
[
  { role: "user",      content: "..." },
  { role: "assistant", content: "...", tool_calls: [...] },
  { role: "tool",      content: "...", tool_call_id: "..." },
  ...
]
```

### Token Knowledge Graph (`token_graph.json`)

After every agent turn, CLIC writes a structured graph of what happened — which model was used, which tools were called, and how many tokens were consumed. This powers the `/tokens` command with accurate per-session and all-time totals.

```
token_graph.json  ←  Knowledge Graph
Session -[HAS_TURN]->   Turn
Turn    -[USED_MODEL]-> Model
Turn    -[CALLED_TOOL]-> Tool
Turn    -[HAS_USAGE]->  TokenUsage  { promptTokens, completionTokens, source: "actual"|"estimated" }
```

Token counts come directly from `stream_options: { include_usage: true }` in the API response. If the API omits usage (some providers), CLIC estimates at ~4 chars/token and marks the record as `estimated`.

### Key properties

| Property | Detail |
|---|---|
| **Zero dependencies** | Pure Node.js `fs` + `JSON` — no LangChain, no vector DB, no external memory service |
| **Survives restarts** | Both files written to disk after every turn and on `/exit` |
| **Full context replay** | Entire message array injected back into the context window on startup |
| **Accurate token tracking** | Actual API usage when available; estimated fallback otherwise |
| **Selective clear** | Use `/clear` in the REPL to wipe chat history (token graph is preserved) |
| **Configurable paths** | `AGENT_HISTORY_FILE` and `AGENT_TOKEN_GRAPH_FILE` env vars |

### Result

The agent remembers previous tasks, code it wrote, commands it ran, and conclusions it reached — across any number of sessions — without you having to re-explain context each time.

```
Session 1:  "Create a FastAPI server in server.py"
            → agent writes server.py, saves memory + token graph

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
| `AGENT_TOKEN_GRAPH_FILE` | No | Custom path for token Knowledge Graph (default: `token_graph.json`) |

---

## Evolution

CLIC started as a pure Bash script (`setup.sh`) powered by Google Gemini, then migrated to SAP AI Core Orchestration Service, and is now a provider-agnostic OpenAI-compatible client:

| Bash v4.1 (Gemini) | TypeScript v4.2 (SAP AI Core) | TypeScript v4.3 (OpenAI-compatible) |
|---|---|---|
| Manual JSON parsing + `done` flag | Native SAP SDK function calling | Native `openai` SDK streaming + tool calls |
| `jq` + `curl` for API calls | `@sap-ai-sdk/orchestration` | `openai` npm package |
| Hardcoded Gemini endpoint | SAP AI Core Orchestration | Any OpenAI-compatible endpoint |
| `eval` for shell commands | `execa` with timeout | `execa` with timeout |
| No token tracking | No token tracking | Knowledge Graph — actual token counts per session |
| Monolithic single file | 18-file modular architecture | 22-file modular architecture + KG + 2 new tools |
| Google Search grounding | Brave / Tavily web search | Brave / Tavily + GitHub + list_models |

---

## License

MIT
