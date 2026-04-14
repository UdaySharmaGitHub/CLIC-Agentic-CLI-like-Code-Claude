# CLIC — Command Line Intelligence Companion

> **v4.2** — An agentic CLI powered by Google Gemini with streaming, function calling, and a modular tool system.

```
   ██████╗██╗     ██╗ ██████╗
  ██╔════╝██║     ██║██╔════╝
  ██║     ██║     ██║██║
  ██║     ██║     ██║██║
  ╚██████╗███████╗██║╚██████╗
   ╚═════╝╚══════╝╚═╝ ╚═════╝
```

CLIC is a terminal-based Agentic CLI that can read/write files, run shell commands, search the web, and chain multiple steps automatically to complete complex tasks — all with human approval before every action.

---

![CLIC](./resources/images/CLIC%20FIrst%20Post.png)

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
- [Knowledge Base](#knowledge-base)
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
| 🔗 Agentic Loop | Auto-chain multiple steps: plan → execute → verify |
| 📚 Knowledge Base | Load role/behavior/persona from a file |
| 🛡️ Safety Layer | Blocked commands + protected paths + human approval |

---

## Tech Stack

| Package | Role |
|---|---|
| **`@google/generative-ai`** | Gemini API with streaming + native function calling |
| **`commander`** | CLI argument parsing (`--model`, `--kb`, `--yolo`, etc.) |
| **`@clack/prompts`** | Interactive setup wizard (API key, KB file) |
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
│   ├── gemini.ts             ← Google Generative AI SDK wrapper (createClient, streamMessage)
│   ├── prompts.ts            ← System prompt builder (buildSystemPrompt)
│   ├── memory.ts             ← Chat history management (load/save/push/clear)
│   ├── safety.ts             ← Blocked commands + protected paths
│   ├── config.ts             ← Environment loading, constants, KB loader
│   ├── ui.ts                 ← Banner, help, status, chalk formatters
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
│       └── webSearch.ts      ← web_search tool (Brave / Tavily)
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

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   index.ts   │────▶│   agent.ts   │────▶│  gemini.ts  │
│  (CLI + REPL)│     │ (ReAct Loop) │     │ (SDK Call)  │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
                           │                     │
                           │  functionCall parts │  streaming response
                           ▼                     │
                    ┌──────────────┐             │
                    │ tools/index  │◀────────────┘
                    │  (Registry)  │
                    └──────┬───────┘
                           │
           ┌───────┬───────┼───────┬───────┬────────┐
           ▼       ▼       ▼       ▼       ▼        ▼
        readFile writeFile runCmd listDir search  webSearch
```

### ReAct Agent Loop

The core pattern is a **ReAct loop** (Reason + Act). This runs in `agent.ts`:

```
User sends message
        │
        ▼
┌───────────────────────┐
│  Call Claude API      │◀──────────────────────┐
│  (streaming response) │                       │
└───────────┬───────────┘                       │
            │                                   │
            ▼                                   │
   ┌─── stop_reason? ───┐                      │
   │                     │                      │
   ▼                     ▼                      │
 "end_turn"         "tool_use"                  │
   │                     │                      │
   ▼                     ▼                      │
 ✅ Done         Execute tool(s)                │
                  with user approval             │
                         │                      │
                         ▼                      │
                  Send tool_result ─────────────┘
                  back to Claude
```

**Key design**: Gemini's native function calling API handles structured calls — no manual JSON parsing or `done` flag needed. The absence of further function calls naturally signals when the agent is finished.

**Step limit**: Max 15 steps per user turn (configurable via `--max-steps`).

### Tool System

Every tool is a self-contained module that exports two things:

```typescript
// src/tools/myTool.ts

export const definition: Anthropic.Messages.Tool = {
  name: 'my_tool',
  description: '...',
  input_schema: { ... },
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
  ├── getToolDefinitions() → JSON schemas for Claude API
  └── executeTool(name, input, confirm) → routes to correct module
```

### Module Responsibilities

| Module | Purpose |
|---|---|
| **`index.ts`** | CLI parsing (commander), setup wizard (@clack/prompts), REPL loop, REPL commands (/exit, /clear, /history, /status, /help, /raw) |
| **`agent.ts`** | The ReAct loop — calls Gemini, handles streaming, executes tools, feeds results back, loops until done or max steps |
| **`gemini.ts`** | Thin wrapper around `@google/generative-ai` — `createClient()` and `streamMessage()` |
| **`prompts.ts`** | Builds the system prompt with live system context (OS, user, CWD, date) + optional knowledge base |
| **`memory.ts`** | Manages `MessageParam[]` in memory — `pushMessage()`, `getMessages()`, `clearMessages()`, `loadHistory()`, `saveHistory()` |
| **`config.ts`** | Loads `.env`, exports constants (`DEFAULT_MODEL`, `DEFAULT_MAX_STEPS`, `HISTORY_FILE`), loads KB files |
| **`safety.ts`** | `isCommandSafe()` checks against blocked patterns, `isPathSafe()` checks against protected paths |
| **`ui.ts`** | `printBanner()`, `printHelp()`, `printStatus()`, `actionLabel()`, `printToolHeader()`, `printDimOutput()`, etc. |
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
GEMINI_API_KEY=AIza...

# Optional: for web search
BRAVE_API_KEY=BSA...
# OR
TAVILY_API_KEY=tvly-...
```

If you don't set `GEMINI_API_KEY` in `.env`, the setup wizard will prompt you interactively.

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
| `--model <model>` | `gemini-2.5-flash` | Gemini model to use |
| `--kb <path>` | — | Path to a knowledge base / role file |
| `--max-steps <n>` | `15` | Max agent steps per user turn |
| `--yolo` | `false` | Auto-approve all actions (skip confirmations) |

### REPL Commands

| Command | Action |
|---|---|
| `/exit` / `/quit` | Save history and exit |
| `/clear` | Clear conversation history |
| `/history` | Show conversation history |
| `/status` | Show system info (OS, model, history count, etc.) |
| `/help` | Show capabilities and example prompts |
| `/raw` | Toggle raw JSON debug output |

---

## Adding a New Tool

The tool system is designed for easy extension. Two steps:

### Step 1: Create the tool module

Create `src/tools/myNewTool.ts`:

```typescript
import type { ToolDefinition, ConfirmFn, ToolResult } from './types.js';

// 1. Define the JSON schema (sent to Gemini)
export const definition: ToolDefinition = {
  name: 'my_new_tool',
  description: 'What this tool does — Gemini reads this to decide when to use it.',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description for Gemini' },
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

That's it. The registry auto-wires the definition (sent to Claude) and the executor (called when Claude uses it).

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
| `GEMINI_API_KEY` | Yes* | Your Google Gemini API key (*prompted interactively if missing) |
| `BRAVE_API_KEY` | No | Brave Search API key (for web_search tool) |
| `TAVILY_API_KEY` | No | Tavily API key (alternative to Brave for web_search) |
| `AGENT_HISTORY_FILE` | No | Custom path for chat history (default: `chat_history.json`) |

---

## Evolution from Bash Version

CLIC started as a pure Bash script (`setup.sh`) powered by Google Gemini. The TypeScript rewrite keeps Google Gemini but gains a first-class SDK, streaming, and a modular architecture:

| Bash v4.1 (Gemini) | TypeScript v4.2 (Gemini) |
|---|---|
| Manual JSON parsing + `done` flag | Native function calling API — no JSON parsing |
| `jq` + `curl` for API calls | `@google/generative-ai` SDK with streaming |
| `done: true/false` loop control | Absence of function calls naturally ends the loop |
| `python3` for find-and-replace | Native `String.indexOf` + substring |
| `eval` for shell commands | `execa` with timeout + error capture |
| `read -p` for confirmations | `readline/promises` + `@clack/prompts` |
| Monolithic single file (~600 lines) | Modular architecture (18 files) |
| Google Search grounding | Brave / Tavily web search APIs |

---

## License

MIT
