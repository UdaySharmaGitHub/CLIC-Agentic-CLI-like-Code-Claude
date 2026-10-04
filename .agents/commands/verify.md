# Verify a Change

Verify that a recent code change to CLIC actually works end-to-end by running the app and observing its behavior.

## Steps

1. Run in single-turn mode to confirm the agent loop executes:
   ```bash
   pnpm dev -- --yolo "list the files in the current directory"
   ```
2. Check that tool calls (if any) complete and return results
3. Verify token usage is tracked — `token_graph.json` should be updated
4. If the change touched a specific tool or command, exercise it directly:
   - Tool change: run a prompt that triggers that tool
   - Command change: launch REPL and run the slash command
5. Check for TypeScript errors surfaced at runtime via `tsx`:
   ```bash
   pnpm build
   ```

## What to report

- What worked
- What failed
- Any unexpected output or errors
- Whether `token_graph.json` was updated after the run

## Notes

- `--yolo` skips all confirmation prompts — safe for verification runs on known-good prompts
- For headless environments, use the driver: see `.agents/skills/run-clic.md`
- If conversation state is affecting results, clear history first: `echo "[]" > chat_history.json`
