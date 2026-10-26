# Architecture Decision Records

An Architecture Decision Record (ADR) captures a significant architectural choice: the context that forced it, what was decided, why, what alternatives were rejected, and what the consequences are. This index is the single place to discover every recorded decision in CLIC.

**To add a new ADR:** run `/adr <Short Title>` in Claude Code, or follow the template in `.agents/skills/adr/SKILL.md`.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| `Accepted` | Decision is in effect and reflected in the codebase |
| `Proposed` | Under discussion, not yet merged |
| `Deprecated` | Was accepted; no longer applies |
| `Superseded` | Replaced by a later ADR (see link) |

---

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [ADR-001](ADR-001-openai-compatible-api.md) | OpenAI-Compatible API as LLM Transport | Accepted | 2026-10-13 |
| [ADR-002](ADR-002-esm-only-output.md) | ESM-Only Build Output | Accepted | 2026-10-13 |
| [ADR-003](ADR-003-react-agentic-loop.md) | ReAct Agentic Loop Pattern | Accepted | 2026-10-13 |
| [ADR-004](ADR-004-node-pty-persistent-terminals.md) | node-pty for Persistent Terminal Sessions | Accepted | 2026-10-13 |
| [ADR-005](ADR-005-zod-validation-gate.md) | Zod Validation Gate for Tool Inputs | Accepted | 2026-10-13 |
| [ADR-006](ADR-006-knowledge-graph-token-tracking.md) | Knowledge Graph for Token Tracking | Accepted | 2026-10-13 |
| [ADR-007](ADR-007-named-session-isolation.md) | Named Session Isolation via Per-Session Directories | Accepted | 2026-10-13 |
| [ADR-008](ADR-008-chokidar-workspace-watcher.md) | chokidar Workspace Watcher Injected into System Prompt | Accepted | 2026-10-13 |
| [ADR-009](ADR-009-ephemeral-no-history-mode.md) | Ephemeral Mode via `src/privacy.ts` Singleton | Accepted | 2026-10-13 |
| [ADR-010](ADR-010-compact-auto-trigger.md) | `/compact` Auto-Trigger at 80% Context Window | Accepted | 2026-10-13 |
| [ADR-011](ADR-011-ink-tui-migration.md) | Ink as TUI Renderer (Migration from Chalk) | Proposed | 2026-10-26 |
