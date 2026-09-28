## Summary

Describe what changed and why.

## Related Issue

Closes or Fixes #

## Type of Change

- [ ] `feature` — new functionality
- [ ] `fix` — bug fix
- [ ] `refactor` — code restructuring, no behavior change
- [ ] `testing` — adding or updating tests
- [ ] `docs` — documentation only
- [ ] `infra` — build, CI, or config change

## Risk Level

- [ ] **Low** — isolated change, no side effects expected
- [ ] **Medium** — touches shared logic or multiple modules
- [ ] **High** — touches core loop, safety layer, or breaking change

## Tests Run

The following three checks are **required** before opening a PR. All must pass.

- [ ] `pnpm typecheck` — TypeScript type check
- [ ] `pnpm build` — production bundle check
- [ ] `pnpm test` — runs all 7 test suites via `test/index.ts`

<details>
<summary>Individual suite shortcuts (for development use only — not required separately)</summary>

```bash
pnpm test:validation-gate   # Validation-gate tests
pnpm test:schemas           # Tool schema shape tests
pnpm test:edge-cases        # Edge-case tests
pnpm test:watcher           # Watcher pure-helper tests
pnpm test:privacy           # Ephemeral-mode tests
pnpm test:export            # Conversation export formatter tests
pnpm test:terminal          # Terminal module tests
```

These are shortcuts to run a single suite in isolation during development. `pnpm test` already covers all of them.
</details>

## How to Verify (Reviewer Steps)

Provide step-by-step instructions so the reviewer can reproduce and verify this change locally.

1. 
2. 
3. 

> Expected result:

## Screenshots / Terminal Output

Paste before/after terminal output or screenshots if this change affects the REPL, tool output, banner, diff view, or any visible behavior. Write `N/A` if not applicable.

**Before:**

```
```

**After:**

```
```

## Affected Files / Areas Changed

List the key files modified and briefly explain why.

```
e.g.
src/tools/myTool.ts       — new tool implementation
src/tools/index.ts        — registered new tool
test/tool-schemas.test.ts — added schema test
```

## Security Considerations

Answer each question. Write `N/A` if the item does not apply to this change.

- [ ] Does this change touch `run_command`, `execa`, or the PTY terminal pool (`src/terminal.ts`)?
- [ ] Does this change touch file read/write tools (`readFile`, `writeFile`, `modifyFile`, `appendFile`)?
- [ ] Does this change modify `src/safety.ts` (blocked commands or protected paths)?
- [ ] Could this change expose API keys, tokens, or secrets in logs or error output?
- [ ] Does this change process external or user-controlled input that could affect tool calls (prompt injection)?

If any box is checked, explain the implications and mitigations below:

## Dependencies

Were any new packages added or existing ones updated?

- [ ] No dependency changes.
- [ ] Yes — listed below with justification:

| Package | Version | Reason |
|---|---|---|
| | | |

> New dependencies must be discussed in an issue before being added (per coding standards).

## Checklist

- [ ] This PR is focused on one logical change.
- [ ] I followed the branch naming convention (`feature/`, `fix/`, `migration/`, etc.).
- [ ] I updated documentation where user-facing behavior changed.
- [ ] I added or updated tests where appropriate.
- [ ] I did not commit `.env` files, API keys, tokens, or generated files.
- [ ] I considered safety implications for shell commands, file access, prompts, and external APIs.
- [ ] I noted breaking changes below.

## Breaking Changes

List any breaking changes or migration steps required, or write `None`.

## Additional Notes

Include follow-up work, known limitations, or any other context the reviewer should know.
