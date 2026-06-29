Update the CLIC project Claude Code configuration at `.claude/settings.json`.

Always read the existing file before making changes — merge new settings, never replace the whole file.

Common tasks for this project:
- Add a new allowed Bash command pattern to `permissions.allow`
- Add a hook (e.g. PostToolUse on Write|Edit to auto-format TypeScript with prettier)
- Set environment variables needed for the dev loop
- Adjust `permissions.defaultMode` for the current working style

Current settings file: `.claude/settings.json`
Local overrides (gitignored): `.claude/settings.local.json`

$ARGUMENTS
