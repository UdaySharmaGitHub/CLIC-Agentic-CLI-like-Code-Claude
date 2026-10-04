# Security Review

Run a security review of the pending changes in CLIC.

## Steps

1. Run `git diff main` to see all changes on this branch
2. Read every touched file in full
3. Audit each file against the high-risk areas below
4. Report findings with file and line references

## High-risk areas

| Area | Risk |
|---|---|
| `src/tools/runCommand.ts` | Command injection via unsanitized user input passed to shell |
| `src/safety.ts` | `isCommandSafe()` blocked patterns and `isPathSafe()` protected paths — check for bypasses |
| `src/tools/writeFile.ts` / `src/tools/modifyFile.ts` | Path traversal outside working directory |
| `src/tools/webSearch.ts` | SSRF or prompt injection via external content fed back to the LLM |
| `src/config.ts` / `.env` | `API_KEY` exposure in logs, error messages, or `chat_history.json` |
| `src/memory.ts` | `chat_history.json` written to disk — ensure no secrets leak into persisted messages |

## What to look for

- User input reaching shell execution without sanitization
- File paths not validated against `isPathSafe()` before write operations
- External content (web search results, file reads) injected into prompts without escaping
- Secrets or credentials appearing in log output or persisted files
- New shell patterns not covered by the `isCommandSafe()` blocklist
- Bypasses to the existing safety checks via edge-case inputs

## Report format

**Files reviewed:** _(list)_
**Branch diff:** `git diff main`

**Findings** by severity:
- 🔴 Critical — exploitable now
- 🟡 High — likely exploitable with attacker control
- 🟠 Medium — risk in specific conditions
- 🔵 Low / informational
- ✅ Clean

**Recommended fixes** — each with file, line, and specific change needed.
