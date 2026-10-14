# ADR-009: Ephemeral Mode via `src/privacy.ts` Singleton

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

Some users need to run CLIC sessions that leave no trace on disk — no chat history, no token graph, no session index entry. Use cases include working with sensitive information (credentials, personal data, confidential business context) and shared machines where history must not persist between users.

The challenge was: CLIC persists data in at least four places (`saveHistory()`, `saveGraph()`, `saveIndex()`, and the legacy root `chat_history.json`). Any new persistence path added in the future would also need to respect the ephemeral flag. We needed a mechanism that was easy to audit and hard to accidentally bypass.

---

## Decision

Implement a single module, `src/privacy.ts`, that exports two functions: `setEphemeral(value: boolean)` and `isEphemeral(): boolean`. The module holds one piece of state: a module-level boolean, default `false`.

Every persistence function (`saveHistory()`, `saveGraph()`, `saveIndex()`) checks `isEphemeral()` at the top and early-returns if `true`. No data is written.

`--no-history` at startup calls `setEphemeral(true)`. The `/privacy` command toggles it mid-session. A `🔒 Privacy` banner is printed at startup and whenever the mode is enabled.

---

## Rationale

- **Single toggle, multiple enforcement points.** Rather than threading a flag through every function signature, the singleton pattern gives every persistence function access to the ephemeral state without any argument changes.
- **Easy to audit.** To verify ephemeral mode is fully enforced, grep for `saveHistory`, `saveGraph`, `saveIndex` — each must have `if (isEphemeral()) return` at the top. This is a one-grep audit.
- **New persistence paths are automatically guarded** if the developer follows the established pattern.
- **Mid-session toggle via `/privacy`** is possible because the flag is runtime state, not a startup-only configuration.

---

## Alternatives Considered

- **Pass `ephemeral` flag through all function signatures** — `saveHistory(messages, { ephemeral })`. Rejected: every caller must know about ephemerality; adding a new persistence path requires updating every call site.
- **Environment variable** — `CLIC_EPHEMERAL=1`. Rejected: can't be toggled mid-session; not visible in the UI; doesn't integrate cleanly with the `/privacy` command.
- **Delete files on exit** — write normally, delete on process exit. Rejected: crashes or SIGKILL would leave files behind; the data is on disk during the session, which defeats the purpose for sensitive use cases.

---

## Consequences

**Positive:**
- Ephemeral mode is guaranteed to cover all current write paths by design.
- The `/privacy` command works mid-session without a restart.
- `test/privacy.test.ts` can verify all write paths by mocking `isEphemeral()`.

**Negative:**
- **Enabling mid-session does not erase already-written turns.** Turns from before `/privacy on` are already on disk. The UI warns about this explicitly.
- **Disabling mid-session writes everything.** The full in-memory history — including turns recorded while ephemeral — is written on the next save. The UI warns about this too.
- The singleton pattern is a global side effect; tests must reset it between cases.

---

## References

- [`src/privacy.ts`](../../src/privacy.ts) — `setEphemeral()`, `isEphemeral()`
- [`src/memory.ts`](../../src/memory.ts) — `saveHistory()` early-return guard
- [`src/knowledgeGraph.ts`](../../src/knowledgeGraph.ts) — `saveGraph()` early-return guard
- [`src/session.ts`](../../src/session.ts) — `saveIndex()` early-return guard
- [`src/commands/privacy.ts`](../../src/commands/privacy.ts) — `/privacy` command, `privacyTransition()` helper
- [`test/privacy.test.ts`](../../test/privacy.test.ts) — ephemeral mode tests
