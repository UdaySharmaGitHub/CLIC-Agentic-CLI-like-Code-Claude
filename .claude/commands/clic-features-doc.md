Document the feature **$ARGUMENTS** by exploring the codebase and writing a complete, accurate feature doc.

## 1 — Locate all relevant files

Infer source files from the feature name:

| Feature domain | Where to look |
|---|---|
| Tool (read_file, web_search, github, …) | `src/tools/<tool>.ts`, `src/tools/index.ts` |
| Slash command (/compact, /tokens, /role, …) | `src/commands/<cmd>.ts`, `src/commands/index.ts`, `src/commands/types.ts` |
| Agent / ReAct loop | `src/agent.ts`, `src/openai.ts` |
| Token tracking / Knowledge Graph | `src/knowledgeGraph.ts`, `src/agent.ts` |
| Memory / history | `src/memory.ts`, `src/index.ts` |
| Safety | `src/safety.ts`, `src/tools/index.ts` |
| UI / display | `src/ui.ts` |
| Config / startup | `src/config.ts`, `src/index.ts` |
| Role / KB system | `src/prompts.ts`, `src/index.ts` |

Always also read: `src/index.ts` (wiring), the relevant registry file, and `CLAUDE.md` (architecture reference).

## 2 — Read every identified file in full

Do not skim. The doc must reflect the actual implementation, not assumptions.

## 3 — Check for an existing doc

Look for `docs/features/$ARGUMENTS.md` (normalise spaces → hyphens, lowercase).  
If it exists, read it so you know what is already there and what needs updating.

## 4 — Build the doc

Write (or overwrite) `docs/features/<feature-name>.md` using the template below.  
Every section must be filled from real code — no placeholder text, no invented details.

---

```markdown
# <Feature Name>

> One-sentence summary of what this feature does and why it exists.

## Overview

2–4 sentences explaining the problem it solves and how it fits into CLIC's overall design.

## Architecture

### Files involved

| File | Role in this feature |
|---|---|
| `src/...` | ... |

### Data flow

Step-by-step numbered list tracing exactly how data moves through the system when this feature activates — from user input (or LLM response) through to final output or side-effect.

### Key types / interfaces

Paste (or describe) the TypeScript types that define this feature's public contract (ToolDefinition, SlashCommand, CommandAction, TokenUsage, etc.) with a short annotation for each field that matters.

## Core code breakdown

Identify the single function, method, or code block that is the **heart** of this feature — the one without which the feature does not exist. Then break it down in detail:

### `<functionName>` — `<file>:<startLine>-<endLine>`

Paste the full source of that function/method verbatim in a TypeScript code block.

Then, immediately below, add a **line-by-line (or logical-block-by-block) annotation** table:

| Lines | What it does | Why it matters |
|---|---|---|
| e.g. 12–15 | e.g. Collects all tool_calls from the LLM response into a local array | Accumulates every tool call before any are executed, enabling parallel dispatch |
| … | … | … |

If the feature has more than one critical function (e.g. a dispatcher and its inner loop), add a second subsection in the same format. Limit to the 2–3 most important functions — do not document every helper.

After the table, add a short **"What makes this the core"** paragraph (2–4 sentences) explaining why this specific function is the engine of the feature — what would break or become impossible if it were removed or changed.

## Workflow

Describe the full lifecycle in prose:
1. How it is triggered (user input, LLM tool_call, slash command, startup hook, etc.)
2. What happens inside the core logic (conditionals, loops, async operations)
3. How results or side-effects are surfaced back to the user or the agent loop

## Configuration & flags

List every env var, CLI flag, or runtime option that affects this feature's behaviour. Include default values and where they are read from (`src/config.ts`, `.env`, CLI parser, etc.).

## Edge cases & safety

Document known edge cases and how the code handles them:
- Empty / malformed input
- API errors / timeouts
- File-system or permission failures
- Interactions with `isCommandSafe()` / `isPathSafe()` if applicable
- Abort / cancellation behaviour if applicable

## Example usage

Show a realistic terminal session (or code snippet) demonstrating the feature end-to-end.

## Related features

Bullet list of other features/files this feature depends on or interacts with, with one-line explanations.
```

---

## 5 — Ensure the docs folder exists

If `docs/features/` does not exist, create it (create a placeholder `docs/features/.gitkeep` if needed, or just write the md file — the directory will be created implicitly).

## 6 — Confirm what was written

After writing the file, print:

```
✅ docs/features/<feature-name>.md written
   Sections: Overview · Architecture · Workflow · Configuration · Edge cases · Example · Related
   Files read: <comma-separated list>
```
