# Architecture Decision Records (ADR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a structured ADR system in `docs/adr/` with a README index, 10 initial ADRs capturing CLIC's most important architectural decisions, and a reusable Claude skill for authoring future ADRs.

**Architecture:** All ADRs live under `docs/adr/` as Nygard-format Markdown files. A README index table links to every ADR. A cross-IDE skill in `.agents/skills/adr/SKILL.md` (+ `.claude/commands/adr.md` for Claude Code) provides a reusable template and workflow for creating new ADRs.

**Tech Stack:** Markdown, Claude Skill YAML frontmatter, no code changes required.

## Global Constraints

- ADR filename format: `ADR-NNN-kebab-case-title.md` under `docs/adr/`
- Status values: `Accepted`, `Proposed`, `Deprecated`, `Superseded by ADR-NNN`
- Date format: `YYYY-MM-DD` (today: 2026-10-13)
- Skill YAML frontmatter must follow `.agents/skills/*/SKILL.md` pattern (name, description)
- AGENTS.md and CLAUDE.md must be updated to register the new skill
- No code changes to `src/` — documentation only

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `docs/adr/README.md` | Master index table of all ADRs |
| Create | `docs/adr/ADR-001-openai-compatible-api.md` | Why OpenAI SDK over native fetch/axios |
| Create | `docs/adr/ADR-002-esm-only-output.md` | Why ESM, no CommonJS dual build |
| Create | `docs/adr/ADR-003-react-agentic-loop.md` | Why ReAct pattern over simple completions |
| Create | `docs/adr/ADR-004-node-pty-persistent-terminals.md` | Why node-pty over child_process/execa |
| Create | `docs/adr/ADR-005-zod-validation-gate.md` | Why Zod at the tool registry boundary |
| Create | `docs/adr/ADR-006-knowledge-graph-token-tracking.md` | Why graph structure over flat log |
| Create | `docs/adr/ADR-007-named-session-isolation.md` | Why per-session directories vs single file |
| Create | `docs/adr/ADR-008-chokidar-workspace-watcher.md` | Why watcher injected into system prompt |
| Create | `docs/adr/ADR-009-ephemeral-no-history-mode.md` | Why singleton privacy module, not a flag in context |
| Create | `docs/adr/ADR-010-compact-auto-trigger.md` | Why 80% threshold auto-compact vs manual only |
| Create | `.agents/skills/adr/SKILL.md` | Cross-IDE ADR authoring skill |
| Create | `.claude/commands/adr.md` | Claude Code `/adr` slash command |
| Modify | `AGENTS.md` | Register ADR skill in skills table |
| Modify | `CLAUDE.md` | Register ADR skill in Custom Slash Commands table |

---

### Task 1: ADR Index README

**Files:**
- Create: `docs/adr/README.md`

- [ ] **Step 1: Create the README index**

Write `docs/adr/README.md` with a status legend, a Markdown table linking to each ADR (number, title, status, date), and a one-paragraph intro explaining what ADRs are and how to add one.

- [ ] **Step 2: Verify**

Open `docs/adr/README.md` and confirm all 10 ADR rows are present with correct filenames.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/README.md
git commit -m "docs(adr): add ADR index README"
```

---

### Task 2: ADR-001 through ADR-005

**Files:**
- Create: `docs/adr/ADR-001-openai-compatible-api.md`
- Create: `docs/adr/ADR-002-esm-only-output.md`
- Create: `docs/adr/ADR-003-react-agentic-loop.md`
- Create: `docs/adr/ADR-004-node-pty-persistent-terminals.md`
- Create: `docs/adr/ADR-005-zod-validation-gate.md`

Each must follow the Nygard format: Context, Decision, Rationale, Alternatives Considered, Consequences, References (with real `src/` file paths).

- [ ] **Step 1: Write ADR-001 through ADR-005**

See full content in execution steps below.

- [ ] **Step 2: Verify**

Check each file has all six sections and references exist at the cited `src/` paths.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-001*.md docs/adr/ADR-002*.md docs/adr/ADR-003*.md docs/adr/ADR-004*.md docs/adr/ADR-005*.md
git commit -m "docs(adr): add ADR-001 through ADR-005"
```

---

### Task 3: ADR-006 through ADR-010

**Files:**
- Create: `docs/adr/ADR-006-knowledge-graph-token-tracking.md`
- Create: `docs/adr/ADR-007-named-session-isolation.md`
- Create: `docs/adr/ADR-008-chokidar-workspace-watcher.md`
- Create: `docs/adr/ADR-009-ephemeral-no-history-mode.md`
- Create: `docs/adr/ADR-010-compact-auto-trigger.md`

Same Nygard format as Task 2.

- [ ] **Step 1: Write ADR-006 through ADR-010**

- [ ] **Step 2: Verify**

Check each file has all six sections.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-006*.md docs/adr/ADR-007*.md docs/adr/ADR-008*.md docs/adr/ADR-009*.md docs/adr/ADR-010*.md
git commit -m "docs(adr): add ADR-006 through ADR-010"
```

---

### Task 4: ADR Skill and Claude Command

**Files:**
- Create: `.agents/skills/adr/SKILL.md`
- Create: `.claude/commands/adr.md`

The skill teaches an agent how to: pick the next ADR number, fill the template, update the README index, and commit.

- [ ] **Step 1: Write `.agents/skills/adr/SKILL.md`**

Include YAML frontmatter (name, description), the ADR template verbatim, step-by-step workflow (read README to get next number → write file → update README index → commit), and gotchas.

- [ ] **Step 2: Write `.claude/commands/adr.md`**

One-liner that invokes the skill with `$ARGUMENTS` as the ADR title.

- [ ] **Step 3: Verify**

Read both files; confirm YAML frontmatter is valid and template matches ADR format used in Tasks 2-3.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/adr/SKILL.md .claude/commands/adr.md
git commit -m "feat(skill): add ADR authoring skill and /adr command"
```

---

### Task 5: Register Skill in AGENTS.md and CLAUDE.md

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update AGENTS.md**

Add row to the "Agent Workflows & Skills" table:
```
| Document an ADR | `.agents/skills/adr/SKILL.md` | `/adr <title>` |
```

Add entry to "Slash Command Routing" section:
```
- `/adr <title>` → Execute `.agents/skills/adr/SKILL.md`
```

- [ ] **Step 2: Update CLAUDE.md**

Add row to "Custom Slash Commands" table:
```
| `/adr` | `.claude/commands/adr.md` | Create a new Architecture Decision Record |
```

Add row to "Skills" table:
```
| `adr` | `.claude/skills/adr/` | Author a new ADR in correct format and update the index |
```

- [ ] **Step 3: Verify**

Read both files and confirm new rows are present and correctly formatted.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: register ADR skill in AGENTS.md and CLAUDE.md"
```
