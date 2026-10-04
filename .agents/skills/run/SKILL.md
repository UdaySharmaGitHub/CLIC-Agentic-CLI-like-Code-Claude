---
name: run
description: >-
  Run the CLIC app in development (source via tsx) or compiled production mode.
  Trigger when the user runs "/run" or asks to run or start CLIC.
---

# Run CLIC

Run the CLIC app using `pnpm dev` (or `pnpm build + pnpm start` for production).

Use `pnpm dev` for quick iteration during development — it runs directly from source via `tsx` with no build step. Use `pnpm build && pnpm start` to test the compiled output.

## Commands

```bash
# Development (source, no build)
pnpm dev

# With CLI flags
pnpm dev -- --model <name>                        # skip the model picker
pnpm dev -- --kb "roles based Workflow/<file>.md" # load a role/persona
pnpm dev -- --yolo                                # skip all confirmation prompts
pnpm dev -- "your prompt"                         # non-interactive single-turn mode
pnpm dev -- --session <name>                      # load or create a named session
pnpm dev -- --no-history                          # ephemeral — nothing written to disk

# Production (compiled)
pnpm build && pnpm start
```

## What to observe

After launching, watch terminal output for:
- Banner renders correctly
- Model picker appears (or is skipped with `--model`)
- Role picker appears (or is skipped with `--kb`)
- REPL prompt is active and accepts input

## Notes

- CLIC requires a real TTY — it will crash with `ERR_TTY_INIT_FAILED` in headless/backgrounded shells
- For headless/automated runs, use the driver: see `.agents/skills/run-clic/SKILL.md`
- `pnpm dev` with `--model gpt-4o` may still show the picker if `gpt-4o` is the `DEFAULT_MODEL` — pass any other model name to reliably skip it
