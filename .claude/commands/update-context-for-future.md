Scan the CLIC codebase for any changes since the last documentation update, then rewrite README.md and CLAUDE.md to accurately reflect the current state of the project.

## Steps

### 1. Gather ground truth from source

Read these files to collect the authoritative current state:

- `package.json` — version, scripts, dependencies
- `src/index.ts` — CLI flags, setup flow, REPL logic
- `src/agent.ts` — AgentOptions interface, loop behaviour, KG recording
- `src/openai.ts` — LLMResponse type, TokenUsage, streamMessage signature
- `src/memory.ts` — exported functions (pushMessage, getMessages, clearMessages, etc.)
- `src/knowledgeGraph.ts` — node types, edge types, exported query helpers
- `src/prompts.ts` — buildSystemPrompt signature, what it injects
- `src/config.ts` — exported constants and env var names
- `src/ui.ts` — all exported function names
- `src/safety.ts` — blocked command patterns, protected paths
- `src/tools/index.ts` — registered tools array
- `src/commands/index.ts` — registered commands array
- `src/commands/types.ts` — CommandContext fields, CommandAction variants
- All files under `src/tools/` — tool names and what each does
- All files under `src/commands/` — command names, aliases, descriptions
- `roles based Workflow/` — list .md files present (don't read contents)

Also run:
```bash
git log --oneline -10
```
to note recent changes that may need to be reflected.

### 2. Detect drift

Compare what you read against the current README.md and CLAUDE.md. Look for:

- New or removed tools (check tool registry vs README tool table)
- New or removed commands (check command registry vs README command table)
- New CLI flags or changed defaults
- New exports in `src/ui.ts` or `src/config.ts`
- Version number mismatch between `package.json` and the README headline
- New env vars in `src/config.ts` not listed in the Environment Variables table
- New KB/role files not listed in the Knowledge Base table
- Changes to `AgentOptions`, `CommandContext`, or `CommandAction` types
- Changes to the Knowledge Graph schema or edges

### 3. Update CLAUDE.md

Rewrite the following sections to match reality (preserve all other content):

- **Commands** block — `pnpm` scripts from `package.json`
- **Key files** table — one row per file in `src/` and `src/tools/` and `src/commands/`
- **Tool system** section — registered tool list, any new helpers
- **Command system** section — registered command list with aliases
- **Knowledge Graph** section — node types, edge types, exported helpers
- Any interface or type signatures that are now stale

### 4. Update README.md

Rewrite the following sections (preserve structure, tone, and Mermaid diagrams unless a diagram is structurally wrong):

- Version number in the headline (match `package.json` `version`)
- **Features** table — add/remove rows for new/removed capabilities
- **Project Structure** tree — reflect actual `src/` file tree
- **Tool System** — registered tools table
- **Module Responsibilities** table — one row per `src/*.ts` module
- **REPL Commands** table — match the registered command list exactly
- **Adding a New Tool** / **Adding a New Command** — update if the pattern changed
- **Knowledge Base** — list of built-in roles in `roles based Workflow/`
- **Environment Variables** table — match `src/config.ts` exported constants
- **Evolution** table — update file count in the v4.x column if it changed

Do NOT change the Mermaid diagrams unless a node or edge is provably wrong based on the source code.
Do NOT rewrite prose sections (Getting Started, Safety narrative, Persistent Agent Memory explanation) unless facts in them are incorrect.

### 5. Verify

After editing, re-read both files and confirm:
- No tool or command from the registry is missing from the docs
- No tool or command appears in the docs that is not in the registry
- The version in README matches `package.json`
- All env var names in the table match what `src/config.ts` actually exports

Report a short summary of every change made (added, removed, corrected).

$ARGUMENTS
