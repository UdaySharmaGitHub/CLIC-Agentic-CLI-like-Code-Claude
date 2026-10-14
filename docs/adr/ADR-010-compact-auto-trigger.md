# ADR-010: `/compact` Auto-Trigger at 80% Context Window

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

Every LLM has a fixed context window (e.g., 128k tokens for GPT-4o). As a CLIC session grows — long conversations, large file reads, verbose tool outputs — the prompt token count approaches this limit. When it exceeds the limit, the API returns an error and the session becomes unusable.

Users do not naturally monitor context fill. They only notice the problem when CLIC suddenly stops working mid-task. We needed a proactive mechanism to prevent context exhaustion without requiring user intervention.

---

## Decision

After every agent turn (and after `/retry`), `index.ts` renders a `printContextBar()` showing the current context fill percentage. When prompt tokens exceed `CONTEXT_GUARD_THRESHOLD` (0.8 = 80%) of `getContextLimit()` for the active model, `runCompact()` is called automatically with `mode: 'auto'`.

`runCompact()` (extracted into `src/commands/compact.ts` for testability) asks the LLM to summarise the conversation so far, replaces the message history with the summary as a single assistant message, and continues the session. The original history is not saved to disk after compaction — only the summarised version persists.

`MODEL_CONTEXT_LIMITS` in `src/config.ts` maps known model names to their context limits. `getContextLimit()` returns a safe default (8k) for unknown models.

---

## Rationale

- **Proactive over reactive.** An auto-trigger prevents the user from hitting a hard API error mid-task. The 80% threshold leaves headroom (20%) for the compact summary itself and the next turn's response.
- **Transparent to the user.** The context bar makes fill visible at all times. Auto-compaction is announced in the UI so the user understands why the history shortened.
- **Reuses the `/compact` command.** `runCompact()` is shared between manual (`/compact`) and automatic invocations. No separate code path.
- **80% is a conservative threshold.** At 80% fill, a model with 128k tokens has ~25k tokens remaining — enough for a thorough summary and several more turns.

---

## Alternatives Considered

- **Hard cap with error** — refuse to run turns when context > 90%, force the user to `/compact` manually. Rejected: abrupt failure mid-task is a poor experience; users may not know about `/compact`.
- **Warn only, no auto-action** — print a warning at 80% but take no action. Rejected: users ignore warnings under deadline pressure; the problem recurs.
- **Sliding window (drop old messages)** — automatically drop the oldest messages to stay under the limit. Rejected: loses context silently; the LLM may reference dropped information and appear confused.
- **Context limit from API** — fetch the model's context limit from the API rather than maintaining `MODEL_CONTEXT_LIMITS`. Rejected: not all providers expose this; a static map with a conservative default is more reliable.

---

## Consequences

**Positive:**
- Sessions never hard-fail due to context overflow during normal use.
- Users can work on long tasks without manually managing context.
- The context bar gives real-time visibility, empowering users to compact manually before the auto-trigger fires.

**Negative:**
- Auto-compaction replaces detailed history with a summary; nuance and exact wording of prior exchanges are lost.
- If the summary itself is very long (e.g., many tool results), it may still push context above the threshold, triggering a second compaction. No loop guard exists for this edge case.
- `MODEL_CONTEXT_LIMITS` requires manual updates when new models are released; unknown models get the conservative 8k default, which may trigger premature compaction on high-context models.

---

## References

- [`src/commands/compact.ts`](../../src/commands/compact.ts) — `runCompact()`, `/compact` command
- [`src/config.ts`](../../src/config.ts) — `MODEL_CONTEXT_LIMITS`, `DEFAULT_CONTEXT_LIMIT`, `CONTEXT_GUARD_THRESHOLD`, `getContextLimit()`
- [`src/ui.ts`](../../src/ui.ts) — `printContextBar()`
- [`src/index.ts`](../../src/index.ts) — post-turn auto-compact check, `printContextBar()` render
