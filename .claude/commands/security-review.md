Run a security review of the pending changes in CLIC.

High-risk areas specific to this codebase:
- `src/tools/runCommand.ts` — command injection via unsanitized user input passed to shell
- `src/safety.ts` — `isCommandSafe()` blocked patterns and `isPathSafe()` protected paths — check for bypasses
- `src/tools/writeFile.ts` / `src/tools/modifyFile.ts` — path traversal outside working directory
- `src/tools/webSearch.ts` — SSRF or prompt injection via external content fed back to the LLM
- `src/config.ts` / `.env` — API_KEY exposure in logs, error messages, or chat_history.json
- `src/memory.ts` — chat_history.json written to disk; ensure no secrets leak into persisted messages

Run `git diff main` to see all changes on this branch, then audit each touched file.

$ARGUMENTS
