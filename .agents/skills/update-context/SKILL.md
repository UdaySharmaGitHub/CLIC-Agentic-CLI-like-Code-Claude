---
name: update-context
description: >-
  Scan the CLIC codebase for drift and update README.md, CLAUDE.md, and AGENTS.md to match the implementation.
  Trigger when the user runs "/update-context" or asks to update documentation context.
---

# Update Documentation Context

Scan the CLIC codebase for any changes since the last documentation update, then rewrite `README.md` and `CLAUDE.md` / `AGENTS.md` to accurately reflect the current state of the project.

## Steps

### 1. Gather ground truth from source

Read these files to collect the authoritative current state:

- `package.json` — version, scripts, dependencies
- `src/index.ts` — CLI flags, setup flow, REPL logic
- `src/agent.ts` — `AgentOptions` interface, loop behaviour, KG recording
- `src/openai.ts` — `LLMResponse` type, `TokenUsage`, `streamMessage` signature
- `src/memory.ts` — exported functions
- `src/knowledgeGraph.ts` — node types, edge types, exported query helpers
- `src/prompts.ts` — `buildSystemPrompt` signature, what it injects
- `src/config.ts` — exported constants and env var names
- `src/ui.ts` — all exported function names
- `src/safety.ts` — blocked command patterns, protected paths
- `src/tools/index.ts` — registered tools array
- `src/commands/index.ts` — registered commands array
- `src/commands/types.ts` — `CommandContext` fields, `CommandAction` variants
- All files under `src/tools/` — tool names and what each does
- All files under `src/commands/` — command names, aliases, descriptions
- `roles based Workflow/` — list `.md` files present (don't read contents)

Also run:
```bash
git log --oneline -10
```

### 2. Detect drift

Compare what you read against `README.md` and `AGENTS.md`. Look for:

- New or removed tools (check tool registry vs docs tool table)
- New or removed commands (check command registry vs docs command table)
- New CLI flags or changed defaults
- New exports in `src/ui.ts` or `src/config.ts`
- Version number mismatch between `package.json` and the README headline
- New env vars in `src/config.ts` not listed
- Changes to `AgentOptions`, `CommandContext`, or `CommandAction` types
- Changes to the Knowledge Graph schema or edges

### 3. Update AGENTS.md

Rewrite the following sections to match reality (preserve all other content):

- **Commands** block — `pnpm` scripts from `package.json`
- **Key files** table — one row per file in `src/`
- **Tool system** section — registered tool list
- **Command system** section — registered command list with aliases
- Any interface or type signatures that are now stale

### 4. Update CLAUDE.md

Since `CLAUDE.md` imports `AGENTS.md` via `@AGENTS.md`, only update the Claude Code-specific sections below the import line — do not duplicate content that is already in `AGENTS.md`.

### 5. Update README.md

Rewrite the following sections (preserve structure and Mermaid diagrams):

- Version number in the headline (match `package.json` `version`)
- **Features** table
- **Project Structure** tree
- **Tool System** — registered tools table
- **Module Responsibilities** table
- **REPL Commands** table
- **Environment Variables** table

### 6. Verify

After editing, confirm:
- No tool or command from the registry is missing from the docs
- No tool or command appears in the docs that is not in the registry
- The version in README matches `package.json`
- `AGENTS.md` and `CLAUDE.md` have no duplicated content

Report a short summary of every change made.
