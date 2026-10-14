---
name: adr
description: >-
  Create a new Architecture Decision Record (ADR) for CLIC. Trigger when the
  user runs "/adr <Title>" or asks to document an architectural decision.
  Picks the next ADR number, writes the file from the template, and updates
  the docs/adr/README.md index.
---

# ADR Authoring Skill

Use this skill whenever a significant architectural decision is made in CLIC and needs to be recorded. This includes:

- Choosing a new dependency or replacing an existing one
- Changing the data model (e.g., adding a new node type to the KG)
- Adding a new persistence mechanism
- Changing the tool execution model
- Any decision where future contributors would ask "why was this done this way?"

All paths below are relative to the repo root.

---

## Step 1: Determine the Next ADR Number

```bash
ls docs/adr/ADR-*.md | sort | tail -1
```

The next number is the highest existing number + 1, zero-padded to 3 digits (e.g., `011`).

---

## Step 2: Choose a Kebab-Case Filename

Format: `docs/adr/ADR-NNN-short-title.md`

- Use all lowercase, hyphens between words
- Keep it short and descriptive (3–6 words)
- Example: `ADR-011-redis-session-cache.md`

---

## Step 3: Write the ADR File

Create `docs/adr/ADR-NNN-short-title.md` using this exact template:

```markdown
# ADR-NNN: Full Title

**Date:** YYYY-MM-DD
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

What is the problem or situation that forced this decision? What constraints existed?
Be specific — name the files, features, or user scenarios that created the need.

---

## Decision

What did we decide to do? State it clearly in 2–4 sentences.
Include the key implementation location (file path).

---

## Rationale

Why did we choose this over the alternatives? List 3–5 reasons, each as a bullet.
Name specific technical advantages, not vague preferences.

---

## Alternatives Considered

- **Alternative A** — brief description, then why rejected
- **Alternative B** — brief description, then why rejected

---

## Consequences

**Positive:**
- ...

**Negative:**
- ...

---

## References

- [`src/relevant-file.ts`](../../src/relevant-file.ts) — what this file does in relation to the decision
- [Related ADR](ADR-NNN-related.md) — if this supersedes or relates to another ADR
```

**Rules:**
- Status should be `Accepted` for decisions already implemented, `Proposed` for under-discussion decisions.
- Every References entry must point to a file that actually exists in the repo.
- Consequences must have at least one Positive and one Negative bullet — no decision is cost-free.
- Date is always `YYYY-MM-DD` format (today's date).

---

## Step 4: Update the README Index

Open `docs/adr/README.md` and add a new row to the Index table:

```markdown
| [ADR-NNN](ADR-NNN-short-title.md) | Full Title | Accepted | YYYY-MM-DD |
```

Insert it at the bottom of the table, after the last existing row.

---

## Step 5: Commit

```bash
git add docs/adr/ADR-NNN-short-title.md docs/adr/README.md
git commit -m "docs(adr): add ADR-NNN - short title"
```

---

## Gotchas

- **Don't pad with filler.** Every section must contain real, specific content. Vague sentences like "This approach is better" are not useful.
- **Link to real files.** Before writing a References entry, verify the file path exists. Use relative links from `docs/adr/` (i.e., `../../src/`).
- **"Proposed" vs "Accepted".** If the decision hasn't been merged yet, use `Proposed`. Change to `Accepted` in the same commit that merges the implementation.
- **Superseding an ADR.** If this ADR replaces an older one, update the old ADR's Status to `Superseded by ADR-NNN` and add a References link in the new ADR.

---

## Example: Documenting a Completed Decision

**User says:** "Document why we chose Redis for session caching."

1. `ls docs/adr/ADR-*.md | sort | tail -1` → `ADR-010-compact-auto-trigger.md` → next is `ADR-011`
2. Filename: `docs/adr/ADR-011-redis-session-cache.md`
3. Write the ADR with Context (why session caching was needed), Decision (Redis via `ioredis`, config in `src/config.ts`), Rationale (pub/sub, TTL support, existing infra), Alternatives (in-memory Map, Memcached), Consequences.
4. Add row to `docs/adr/README.md`.
5. Commit: `git commit -m "docs(adr): add ADR-011 - redis session cache"`
