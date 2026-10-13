# ADR-003: ReAct Agentic Loop Pattern

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

CLIC needs to let an LLM take a series of actions (tool calls) in response to a user prompt before producing a final answer. A single LLM call that returns text is insufficient — many useful tasks require reading a file, running a command, inspecting the result, and acting on it.

We needed an execution model that was:
1. Compatible with the OpenAI function-calling API.
2. Bounded (a runaway loop must be stoppable).
3. Transparent (the user can see each step as it happens).

---

## Decision

Implement the **ReAct (Reasoning + Acting)** pattern in `src/agent.ts`. The loop:

1. Calls the LLM with the current message history.
2. Streams the response. If the response contains tool calls, execute them (with user confirmation).
3. Push tool results back into the message history as `tool` role messages.
4. Repeat from step 1 until the LLM returns a response with no tool calls, or `maxSteps` is reached.

The loop is controlled by `runAgentTurn(options)` and accepts an `AbortSignal` for mid-run cancellation.

---

## Rationale

- **Native fit for OpenAI function calling.** The OpenAI API returns `tool_calls` alongside `content` in a single response. ReAct maps directly to this: reason → call → observe → repeat.
- **No framework dependency.** The loop is ~100 lines of TypeScript. There is no need for LangChain, LlamaIndex, or a dedicated agent framework to implement this pattern.
- **Bounded by design.** `maxSteps` (default configurable via `--max-steps`) prevents infinite loops caused by a confused LLM.
- **User visibility.** Each iteration renders a step header via `printStepHeader()` in `src/ui.ts`, giving the user a real-time view of what the agent is doing.

---

## Alternatives Considered

- **Single LLM call with post-processing** — no tool-call loop; the LLM generates a plan in one shot and code executes it. Rejected: too brittle, cannot react to runtime results (e.g., a command that fails).
- **LangChain.js agent executor** — provides ReAct out of the box but adds a large dependency with its own abstractions over tool definitions, memory, and chains. CLIC's tool system is simpler and more directly controllable. Rejected.
- **Function-call streaming without loop** — execute tool calls from a single response, return results to user without feeding back into LLM. Rejected: multi-step reasoning (read → edit → verify) requires iterating.

---

## Consequences

**Positive:**
- The agent can self-correct: if a tool fails, the LLM sees the error and can retry with different arguments.
- Adding new tools doesn't require changes to the loop — only to the tool registry.
- `AbortSignal` support allows the user to cancel mid-run without leaving orphaned processes.

**Negative:**
- Without `maxSteps`, a confused LLM could loop indefinitely. The default must be set conservatively.
- Each iteration adds a round-trip to the LLM, increasing latency and token cost for complex tasks.
- The loop is inherently sequential per agent turn; parallel tool calls within a single response are handled (see `src/agent.ts`), but multiple independent subtasks still block on each other.

---

## References

- [`src/agent.ts`](../../src/agent.ts) — `runAgentTurn()`, parallel/sequential tool dispatch
- [`src/openai.ts`](../../src/openai.ts) — `streamMessage()` that feeds each iteration
- [`src/tools/index.ts`](../../src/tools/index.ts) — `executeTool()` called inside the loop
- [`src/config.ts`](../../src/config.ts) — `DEFAULT_MAX_STEPS`
