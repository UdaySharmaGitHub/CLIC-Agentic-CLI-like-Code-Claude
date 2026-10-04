---
name: feature-review
description: >-
  Review the implementation of a specific feature in CLIC across tools, commands, and the ReAct loop.
  Trigger when the user runs "/feature-review" or asks to review a specific feature.
---

# Review a Specific Feature

Review the feature: **<feature-name>**

> Replace `<feature-name>` with the name of the feature you are reviewing (e.g. `parallel-tool-execution`, `named-sessions`, `privacy-mode`).

## 1 — Find relevant files

Infer files from the feature domain:

| Domain | Where to look |
|---|---|
| Tool | `src/tools/` |
| Slash command | `src/commands/` |
| Loop behaviour (parallel, abort, retry) | `src/agent.ts`, `src/openai.ts` |
| Persistence (tokens, history) | `src/knowledgeGraph.ts`, `src/memory.ts` |
| UI / display | `src/ui.ts` |
| Safety | `src/safety.ts` |

Always include: `src/index.ts`, `src/commands/types.ts`, and the relevant registry (`src/tools/index.ts` or `src/commands/index.ts`).

## 2 — Read every identified file in full

Do not skim. The review must reflect the actual implementation.

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

**Feature:** `<feature-name>`
**Files reviewed:** _(list)_

**Findings** by severity:
- 🔴 Bug — description + file:line
- 🟡 Risk / unhandled edge case
- 🟠 Integration gap
- 🔵 Code quality
- ✅ What is solid

**Fixes** — ordered by priority, each with file and line.
