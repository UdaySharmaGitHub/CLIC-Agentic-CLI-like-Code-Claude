---
name: code-review
description: >-
  Review current git diffs for correctness, bugs, edge cases, type safety, and simplification opportunities.
  Trigger when the user runs "/code-review" or asks to review code changes.
---

# Code Review

Review the current diff for correctness bugs and simplification opportunities in CLIC.

## Steps

1. Run `git diff` and `git diff --staged` to see what changed
2. Read every affected file in full — do not skim
3. Review against the focus areas below
4. Report findings by severity

## Focus areas

| Area | What to check |
|---|---|
| `src/agent.ts` | ReAct loop correctness, AbortSignal handling, parallel tool execution via `Promise.all` |
| `src/openai.ts` | Streaming chunk assembly, `tool_call` delta merging, token usage extraction |
| `src/tools/` | Tool definition schemas match `execute()` signatures; `confirm()` called before destructive ops |
| `src/commands/` | `CommandAction` return types correct; context mutations safe |
| `src/safety.ts` | Blocked command patterns complete; path protection not bypassable |
| `src/memory.ts` | Message format matches OpenAI spec; history persistence correct |

## Review dimensions

| Dimension | What to check |
|---|---|
| **Correctness** | Logic matches stated intent; all branches (success, error, empty) handled |
| **Types** | No `any`, no unchecked casts; input shapes match `ToolDefinition` / `SlashCommand` |
| **Loop integration** | Tool returns `ToolResult`; command returns `CommandAction` in every path |
| **Safety** | `isPathSafe()` / `isCommandSafe()` called where needed; `confirm()` before destructive ops |
| **Edge cases** | Empty input, large output, API failure — handled without crashing the REPL |
| **Output** | Uses `src/ui.ts` helpers consistently; not silent on failure |

## Report format

**Files reviewed:** _(list)_

**Findings** by severity:
- 🔴 Bug — description + file:line
- 🟡 Risk / unhandled edge case
- 🟠 Integration gap
- 🔵 Code quality
- ✅ What is solid

**Fixes** — ordered by priority, each with file and line.
