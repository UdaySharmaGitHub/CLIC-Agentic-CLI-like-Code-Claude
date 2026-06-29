Run the CLIC app using pnpm dev (or pnpm build + pnpm start for production). Use `pnpm dev` for quick iteration during development — it runs directly from source via tsx with no build step. Use `pnpm build && pnpm start` to test the compiled output.

Pass any CLI flags after the command:
- `pnpm dev -- --model <name>` to skip the model picker
- `pnpm dev -- --kb "roles based Workflow/<file>.md"` to load a role
- `pnpm dev -- --yolo` to skip all confirmation prompts
- `pnpm dev -- "your prompt"` for non-interactive single-turn mode

After launching, observe terminal output for errors, banner rendering, and REPL behavior. Report what you see.
