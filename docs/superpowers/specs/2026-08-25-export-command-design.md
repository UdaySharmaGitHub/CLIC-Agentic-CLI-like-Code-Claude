# /export Command — Design Spec

**Date:** 2026-08-25
**Status:** Approved, pending implementation

---

## Overview

Add a `/export [format]` slash command to CLIC that serialises the active conversation to a file in the current working directory. Supports three formats: markdown, json, html. Optionally exports just the in-memory window or the full history from disk.

---

## Command Interface

**File:** `src/commands/export.ts`

**Invocation patterns:**

```
/export              → interactive picker (format → scope)
/export markdown     → skip format picker, ask scope
/export json         → skip format picker, ask scope
/export html         → skip format picker, ask scope
```

**Output filename pattern:** `clic-export-YYYY-MM-DD.<ext>` saved to `process.cwd()`.
If the filename already exists, a counter suffix is appended: `clic-export-2026-08-25-2.md`.

**Return value:** `{ type: 'continue' }` — stays in the REPL after export.

---

## Picker Flow

Uses `@clack/prompts select` (same pattern as `/model` and `/role`).

**Step 1 — Format** (skipped if format provided as arg):

| Option | Value |
|---|---|
| Markdown — human-readable | `markdown` |
| JSON — raw message array | `json` |
| HTML — styled shareable page | `html` |

**Step 2 — Scope:**

| Option | Value |
|---|---|
| Current window (N messages in memory) | `window` |
| Full history (load from disk) | `full` |

In privacy mode (`isEphemeral() === true`), the "Full history" option is hidden and a note is shown:
> `Running in privacy mode — exporting current window only`

---

## Format Specifications

### Markdown (`toMarkdown`)

Header block:
```markdown
# CLIC Conversation Export
- Session: <sessionName or "default">
- Model: <model>
- Exported: <ISO date>
- Messages: <count>
```

Per-message rendering:

| Role | Rendering |
|---|---|
| `user` | `## You` + content |
| `assistant` | `## Assistant` + text; tool_calls in `<details><summary>🔧 Tool: <name></summary>args JSON</details>` |
| `tool` | Skipped |
| `system` | Skipped |

### JSON (`toJson`)

Raw `ChatMessage[]` pretty-printed:
```json
{
  "exportedAt": "<ISO timestamp>",
  "session": "<sessionName>",
  "model": "<model>",
  "messages": [ ...ChatMessage[] ]
}
```

### HTML (`toHtml`)

Self-contained single file — all CSS inlined, no external dependencies.
- Dark-friendly colour scheme
- Monospace font for code blocks
- Bubble-style layout with role badges (`You`, `Assistant`, `Tool`)
- Tool calls rendered as `<details><summary>` toggles
- Header card showing session, model, export date, message count

---

## Scope: Full History Loading

When the user selects "full history":
1. Read path from `getHistoryFile()` (already points at the active session file)
2. `fs.readFile` + `JSON.parse` — read-only, does **not** replace in-memory messages
3. Pass the loaded array to the formatter

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| History file does not exist | Fall back to in-memory messages + print warning |
| Disk read fails | Same fallback + print error reason |
| File write fails | Print error with reason, return `continue` |
| User cancels picker (ESC / Ctrl+C in `@clack`) | Print "Export cancelled.", return `continue` |

---

## Integration

### Registering the command

In `src/commands/index.ts`:
```typescript
import { command as exportCmd } from './export.js';
// add exportCmd to the commands array
```

### CommandContext fields used

| Field | Used for |
|---|---|
| `sessionName` | File header and filename fallback |
| `model` | File header |

No new fields needed on `CommandContext`.

---

## Files Changed

| File | Change |
|---|---|
| `src/commands/export.ts` | New — command + all three formatters |
| `src/commands/index.ts` | Import + register `exportCmd` |

---

## Out of Scope

- Custom output path (always CWD)
- Re-importing an exported JSON back into CLIC
- Exporting token graph / pricing data
