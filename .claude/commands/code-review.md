Review the current diff for correctness bugs and simplification opportunities in CLIC.

Focus areas for this codebase:
- `src/agent.ts` — ReAct loop correctness, AbortSignal handling, parallel tool execution via Promise.all
- `src/openai.ts` — streaming chunk assembly, tool_call delta merging, token usage extraction
- `src/tools/` — tool definition schemas match execute() signatures, confirm() called before destructive ops
- `src/commands/` — CommandAction return types correct, context mutations safe
- `src/safety.ts` — blocked command patterns complete, path protection not bypassable
- `src/memory.ts` — message format matches OpenAI spec, history persistence correct

Run `git diff` and `git diff --staged` to see what changed, then read the affected files.

$ARGUMENTS
