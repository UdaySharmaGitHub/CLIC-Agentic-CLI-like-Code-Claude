# ADR-005: Zod Validation Gate for Tool Inputs

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

LLMs occasionally hallucinate invalid tool arguments — passing a string where a number is expected, omitting required fields, or sending an object where a string is expected. Without a validation layer, these bad inputs reach `execute()` and cause runtime errors with cryptic stack traces that are hard to surface back to the LLM as actionable feedback.

Each tool already defines a JSON Schema for its parameters (sent to the LLM so it knows what to pass). We needed a way to enforce those schemas at runtime before any tool logic runs.

---

## Decision

Add a `schema: z.ZodTypeAny` field to every `ToolDefinition`. In `executeTool()` (the single dispatch point in `src/tools/index.ts`), call `tool.definition.schema.safeParse(input)` before invoking `execute()`. If parsing fails, return a structured error result immediately — no tool logic runs.

Each tool module defines its Zod schema inline, alongside the JSON Schema used for the LLM's function definition. The two stay in sync by convention (both are in the same file).

---

## Rationale

- **Single enforcement point.** All validation happens in `executeTool()`. No tool module needs to validate its own inputs; it can trust `execute()` receives well-typed arguments.
- **Zod is already in the dependency tree** for `@clack/prompts`. No new dependency added.
- **`safeParse` never throws.** It returns a discriminated union (`{ success: true, data } | { success: false, error }`), so validation failures are handled as structured values, not exceptions.
- **Clear LLM feedback.** The error result includes Zod's validation message, which the LLM receives as a tool result and can use to self-correct on the next iteration.
- **Type inference.** The Zod schema doubles as the TypeScript type for `execute()`'s `input` parameter via `z.infer<typeof schema>`.

---

## Alternatives Considered

- **Manual validation per tool** — each `execute()` validates its own inputs with hand-written checks. Rejected: duplicated effort, inconsistent error formats, and no single place to audit.
- **JSON Schema validation (Ajv)** — the LLM's JSON Schema could also be used for runtime validation. Rejected: Ajv adds a dependency; Zod provides validation *and* TypeScript types from one definition.
- **No validation** — trust the LLM to pass valid inputs. Rejected: in practice, hallucinated arguments are a real source of confusing runtime errors, especially with complex schemas like the `terminal` tool's discriminated union.

---

## Consequences

**Positive:**
- Invalid LLM arguments produce a clean error message that feeds back into the ReAct loop.
- Tool authors write one schema definition and get both LLM function spec and runtime validation.
- The test suite (`test/zod-validation.test.ts`) can verify all tool schemas comprehensively.

**Negative:**
- The Zod schema and the JSON Schema sent to the LLM can drift if a developer updates one but not the other. There is no automated sync check.
- Overly strict schemas can reject valid LLM outputs that are semantically correct but structurally unexpected (e.g., a number passed as a string).

---

## References

- [`src/tools/index.ts`](../../src/tools/index.ts) — `executeTool()` validation gate
- [`src/tools/types.ts`](../../src/tools/types.ts) — `ToolDefinition` type with `schema` field
- [`test/zod-validation.test.ts`](../../test/zod-validation.test.ts) — validation gate tests
- [`test/tool-schemas.test.ts`](../../test/tool-schemas.test.ts) — tool schema shape tests
