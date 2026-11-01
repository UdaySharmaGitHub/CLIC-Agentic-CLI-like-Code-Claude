# CLIC Documentation

> Reference docs, architecture decisions, feature deep-dives, and infrastructure guides for the CLIC project.

---

## 📂 Directory Overview

### 🏛️ [Architecture Decision Records](adr/)

Captures the *why* behind every major technical choice — immutable records written at decision time.

| # | Decision |
|---|---|
| [ADR-001](adr/ADR-001-openai-compatible-api.md) | OpenAI-compatible API |
| [ADR-002](adr/ADR-002-esm-only-output.md) | ESM-only output |
| [ADR-003](adr/ADR-003-react-agentic-loop.md) | ReAct agentic loop |
| [ADR-004](adr/ADR-004-node-pty-persistent-terminals.md) | node-pty persistent terminals |
| [ADR-005](adr/ADR-005-zod-validation-gate.md) | Zod validation gate |
| [ADR-006](adr/ADR-006-knowledge-graph-token-tracking.md) | Knowledge Graph token tracking |
| [ADR-007](adr/ADR-007-named-session-isolation.md) | Named session isolation |
| [ADR-008](adr/ADR-008-chokidar-workspace-watcher.md) | Chokidar workspace watcher |
| [ADR-009](adr/ADR-009-ephemeral-no-history-mode.md) | Ephemeral `--no-history` mode |
| [ADR-010](adr/ADR-010-compact-auto-trigger.md) | Auto-compact trigger |
| [ADR-011](adr/ADR-011-ink-tui-migration.md) | Ink TUI migration |

---

### 📖 [Feature Documentation](features/)

In-depth technical write-ups for each major feature — architecture, data flow, edge cases, and examples.

| Feature | Document |
|---|---|
| Auto Context Window Guard & Auto-Compact | [Auto-Context-Window-Guard-Auto-Compact.md](features/Auto-Context-Window-Guard-Auto-Compact.md) |
| Diff Display for File Writes | [Diff-Display-for-File-Writes.md](features/Diff-Display-for-File-Writes.md) |
| Conversation Export | [conversation-export.md](features/conversation-export.md) |
| Ink TUI Migration | [ink-tui-migration.md](features/ink-tui-migration.md) |
| Multi-Terminal Parallel Processing | [multi-terminal-parallel-processing.md](features/multi-terminal-parallel-processing.md) |
| Multiline Input Support | [multiline-input-support.md](features/multiline-input-support.md) |
| Named Sessions | [named-sessions.md](features/named-sessions.md) |
| No-History / Privacy Flag | [no-history-privacy-flag.md](features/no-history-privacy-flag.md) |
| Workspace File Watching | [workspace-file-watching.md](features/workspace-file-watching.md) |
| Zod Tool Input Validation | [zod-tool-input-validation.md](features/zod-tool-input-validation.md) |

---

### ⚙️ [Infrastructure](infrastructure/)

CI/CD pipelines, deployment guides, and operational runbooks.

| Document |
|---|
| [GitHub Actions CI Pipeline](infrastructure/github-actions-ci-pipeline.md) |

#### GitHub Action Docs

| Workflow | Document |
|---|---|
| CI | [ci.md](<infrastructure/GitHub Action Docs/ci.md>) |
| CodeQL | [codeql.md](<infrastructure/GitHub Action Docs/codeql.md>) |
| Dependabot | [dependabot.md](<infrastructure/GitHub Action Docs/dependabot.md>) |
| Dependabot Auto-Merge | [dependabot-auto-merge.md](<infrastructure/GitHub Action Docs/dependabot-auto-merge.md>) |
| PR Labeler | [pr-labeler.md](<infrastructure/GitHub Action Docs/pr-labeler.md>) |
| Stale Issues | [stale.md](<infrastructure/GitHub Action Docs/stale.md>) |
| Welcome | [welcome.md](<infrastructure/GitHub Action Docs/welcome.md>) |

---

### ⚡ [Superpowers](superpowers/)

Plans and specifications for Superpowers skill integrations.

| Folder | Contents |
|---|---|
| [plans/](superpowers/plans/) | Implementation plans |
| [specs/](superpowers/specs/) | Feature specifications |

---

> **Contributing a doc?** Place ADRs in `adr/` using the `ADR-NNN-title.md` naming convention and feature docs in `features/`. Update this index when you add a new file.
