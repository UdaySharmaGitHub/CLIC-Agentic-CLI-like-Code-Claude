Review the feature: **$ARGUMENTS**

## 1 — Find relevant files

Infer files from the feature domain:
- Tool → `src/tools/`
- Command → `src/commands/`
- Loop behaviour (parallel, abort, retry) → `src/agent.ts`, `src/openai.ts`
- Persistence (tokens, history) → `src/knowledgeGraph.ts`, `src/memory.ts`
- UI/display → `src/ui.ts`
- Safety → `src/safety.ts`

Always include: `src/index.ts`, `src/commands/types.ts`, and the relevant registry (`src/tools/index.ts` or `src/commands/index.ts`).

## 2 — Read every identified file in full

## 3 — Review

| Dimension | What to check |
|---|---|
| **Correctness** | Logic matches stated intent; all branches (success, error, empty) handled |
| **Types** | No `any`, no unchecked casts; input shapes match `ToolDefinition` / `SlashCommand` |
| **Loop integration** | Tool returns `ToolResult`; command returns `CommandAction` in every path |
| **Safety** | `isPathSafe()` / `isCommandSafe()` called where needed; `confirm()` before destructive ops |
| **Edge cases** | Empty input, large output, API failure — handled without crashing the REPL |
| **Output** | Uses `src/ui.ts` helpers consistently; not silent on failure |

## 4 — Report

**Feature:** `$ARGUMENTS`
**Files reviewed:** _(list)_

**Findings** by severity:
- 🔴 Bug — description + file:line
- 🟡 Risk / unhandled edge case
- 🟠 Integration gap
- 🔵 Code quality
- ✅ What is solid

**Fixes** — ordered by priority, each with file and line.
