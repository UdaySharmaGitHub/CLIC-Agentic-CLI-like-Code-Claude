Scan recent Claude Code transcripts for repeated permission prompts in this project and add allowlist rules to `.claude/settings.json` to reduce friction.

Steps:
1. Look at `.claude/settings.json` to see what's already allowed
2. Identify patterns in this project's dev loop that commonly need approval:
   - `pnpm` commands (dev, build, start, run lint)
   - `git` read commands (diff, log, status, show, branch)
   - Reading `src/**` files
   - Reading config files (tsconfig.json, package.json)
3. Add precise `Bash(...)` and `Read(...)` allow rules for confirmed safe patterns
4. Avoid overly broad rules — prefer `Bash(pnpm *)` over `Bash(*)`

Update `.claude/settings.json` with the merged result.
