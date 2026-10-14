# ADR-001: OpenAI-Compatible API as LLM Transport

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

CLIC needs to send prompts to a large language model and receive streamed responses with optional tool calls. The LLM market is fragmented: OpenAI, Anthropic, Mistral, Cohere, and self-hosted models each expose different APIs. We needed one client that worked across providers without rewriting the transport layer each time.

LiteLLM and similar proxy projects had already converged the ecosystem on the OpenAI message format — any model reachable via LiteLLM speaks the same wire protocol. This made the OpenAI SDK a de-facto lingua franca rather than a vendor lock-in.

---

## Decision

Use the `openai` npm package as the sole HTTP client for all LLM calls. Configure it via two environment variables:

- `API_KEY` — the provider's API key (or a LiteLLM master key)
- `BASE_URL` — the endpoint root (defaults to `https://api.openai.com/v1`)

Streaming, tool-call delta assembly, retry logic, and token-usage extraction all live in `src/openai.ts` and are exposed through the single function `streamMessage()`.

---

## Rationale

- **Provider-agnostic by default.** Pointing `BASE_URL` at a LiteLLM proxy lets users switch between GPT-4o, Claude, Gemini, and local Ollama models without touching source code.
- **Official SDK handles edge cases.** Streaming chunk assembly, automatic retries on connection resets, and type-safe response shapes come for free.
- **Single integration surface.** All LLM concerns are encapsulated in `src/openai.ts`; the rest of the codebase never calls the OpenAI SDK directly.
- **Tool-call format compatibility.** The OpenAI function-calling format is the most widely replicated format across open-source models, reducing friction when swapping models.

---

## Alternatives Considered

- **Native `fetch` with hand-rolled types** — more control, but requires reimplementing streaming, retry, and type safety from scratch. High maintenance cost.
- **Anthropic SDK** — would lock CLIC to Anthropic-only models; ruled out because multi-provider support was a first-class goal.
- **LangChain.js** — adds significant abstraction overhead and a large dependency tree for features CLIC doesn't need. The ReAct loop is implemented directly in `src/agent.ts` (see ADR-003).
- **Vercel AI SDK** — good streaming abstractions but couples to Vercel's model registry; heavier than needed.

---

## Consequences

**Positive:**
- One `BASE_URL` change switches the entire stack to a different provider.
- `pnpm dev -- --model <name>` works against any model the configured endpoint exposes.
- The `/model` command reloads the live model list from the same endpoint at runtime.

**Negative:**
- CLIC is tied to the OpenAI message format (roles: `system`, `user`, `assistant`, `tool`). Providers that diverge significantly from this shape require a LiteLLM proxy in front.
- Token-usage fields in streaming responses are provider-dependent; `src/openai.ts` falls back to character-count estimation when the API omits them.

---

## References

- [`src/openai.ts`](../../src/openai.ts) — `createClient()`, `streamMessage()`, `withRetry()`
- [`src/config.ts`](../../src/config.ts) — `DEFAULT_MODEL`, `BASE_URL` defaults
- [`src/tools/listModelfromOpenAI.ts`](../../src/tools/listModelfromOpenAI.ts) — `fetchAvailableModelOptions()` startup helper
