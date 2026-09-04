# CLIC Test Suite Documentation

> A comprehensive, modular test framework covering Zod schema validation, tool schemas, edge cases, workspace watcher, privacy mode, conversation export, and the terminal module.

## Quick Start

```bash
# Run all 163 tests
pnpm test

# Run specific suite
pnpm test:validation-gate    # 18 tests — core validation gate
pnpm test:schemas            # 37 tests — per-tool schema rules
pnpm test:edge-cases         # 27 tests — boundary & type-coercion
pnpm test:watcher            # 10 tests — watcher pure helpers
pnpm test:privacy            # 15 tests — ephemeral session / --no-history
pnpm test:export             # 23 tests — conversation export formatter
pnpm test:terminal           # 33 tests — terminal pure helpers + TerminalManager integration
```

## Test Suite Overview

### 📊 Results
- **Total Tests**: 163
- **Passed**: 163 ✅
- **Failed**: 0 ✅
- **Execution Time**: ~500ms (Zod suites) + ~2–5 s (terminal integration, node-pty)

### 🗂️ Structure

```
test/
├── index.ts                      # Main test runner — imports & runs all suites
├── zod-validation.test.ts        # Core validation gate tests (18)
├── tool-schemas.test.ts          # Individual tool schema tests (37)
├── edge-cases.test.ts            # Edge case & boundary tests (27)
├── watcher.test.ts               # Watcher pure-helper tests (10)
├── privacy.test.ts               # Privacy / --no-history tests (15)
├── export.test.ts                # Conversation export tests (23)
├── terminal.test.ts              # Terminal module tests (33)
└── utils/
    └── test-helpers.ts           # Shared test framework & utilities
```

```mermaid
flowchart TD,
  A["pnpm test"] --> B["test/index.ts"]
  B --> C["Validation gate\n18 tests"]
  B --> D["Tool schemas\n37 tests"]
  B --> E["Edge cases\n27 tests"]
  B --> F["Watcher helpers\n10 tests"]
  B --> G["Privacy mode\n15 tests"]
  B --> H["Conversation export\n23 tests"]
  B --> I["Terminal module\n33 tests"]
  C --> J["Aggregate results"]
  D --> J
  E --> J
  F --> J
  G --> J
  H --> J
  I --> J
  J --> K{"Any failures?"}
  K -->|No| L["Exit 0: all tests passed"]
  K -->|Yes| M["Exit 1: failures reported"]
```

---

## Test Coverage

### Validation Gate Tests (18)

Tests the core `executeTool()` validation gate that runs before every tool call.

| # | Description | Expected |
|---|---|---|
| 1 | rejects number when string expected | ❌ |
| 2 | rejects number for command field | ❌ |
| 3 | rejects boolean when string expected | ❌ |
| 4 | rejects object when string expected | ❌ |
| 5 | rejects empty object (all fields required) | ❌ |
| 6 | rejects missing command field | ❌ |
| 7 | rejects partial input (missing required fields) | ❌ |
| 8 | rejects empty filepath string | ❌ |
| 9 | rejects empty command string | ❌ |
| 10 | rejects empty pattern string | ❌ |
| 11 | accepts valid filepath | ✅ |
| 12 | accepts valid command | ✅ |
| 13 | accepts pattern and optional directory | ✅ |
| 14 | accepts pattern without optional directory | ✅ |
| 15 | accepts no args when all fields optional | ✅ |
| 16 | rejects null when string expected | ❌ |
| 17 | rejects undefined filepath | ❌ |
| 18 | accepts valid github profile input | ✅ |

---

### Tool Schema Tests (37)

Tests each tool's specific Zod schema. Schema-only — no tool execution, no side effects.

#### `read_file` (4 tests)
- ✅ valid filepath
- ❌ empty filepath
- ❌ missing filepath
- ❌ number filepath

#### `write_file` (5 tests)
- ✅ valid filepath and content
- ❌ empty filepath
- ❌ empty content
- ❌ missing filepath
- ❌ missing content

#### `append_file` (3 tests)
- ✅ valid filepath and content
- ❌ empty filepath
- ❌ empty content

#### `modify_file` (5 tests)
- ✅ valid all fields (filepath, find, replace)
- ❌ empty filepath
- ❌ empty find
- ❌ empty replace
- ❌ missing replace

#### `list_directory` (3 tests)
- ✅ valid path
- ✅ no args (path is optional)
- ❌ number path

#### `run_command` (4 tests)
- ✅ valid command
- ❌ empty command
- ❌ missing command
- ❌ number command

#### `search_files` (4 tests)
- ✅ valid pattern
- ✅ pattern and directory
- ❌ missing pattern
- ❌ empty pattern

#### `web_search` (3 tests)
- ✅ valid query
- ❌ empty query
- ❌ missing query

#### `github` (6 tests)
- ✅ valid profile action
- ✅ valid repos action
- ✅ with optional limit field
- ❌ missing username
- ❌ missing action
- ❌ invalid action value (`delete` not in enum)

---

### Edge Case Tests (27)

Boundary conditions, type coercion, and special input scenarios.

#### Null / Undefined (2 tests)
- ❌ rejects null for required string field
- ❌ rejects undefined for required string field

#### Empty vs Whitespace (2 tests)
- ✅ accepts whitespace filepath (not empty — passes min:1)
- ❌ rejects zero-length string

#### Type Coercion (4 tests)
- ❌ rejects boolean `true`
- ❌ rejects boolean `false`
- ❌ rejects `NaN`
- ❌ rejects `Infinity`

#### Arrays and Objects (2 tests)
- ❌ rejects array when string expected
- ❌ rejects plain object when string expected

#### Optional Fields (2 tests)
- ✅ accepts omitted optional field (directory in `search_files`)
- ✅ accepts optional field with value

#### Extra Fields (2 tests)
- ✅ ignores extra fields not in schema
- ✅ ignores extra fields but still validates required ones

#### Special Characters (3 tests)
- ✅ accepts filepath with special characters
- ✅ accepts command with special characters
- ✅ accepts pattern with glob special chars (`*.ts`, `**`)

#### Long Strings (2 tests)
- ✅ accepts very long filepath (up to 1500 chars)
- ✅ accepts very long command

#### Unicode / Emoji (2 tests)
- ✅ accepts unicode characters in filepath
- ✅ accepts emoji in command

#### Whitespace in Content (2 tests)
- ✅ accepts newlines in `write_file` content
- ✅ accepts tabs in `write_file` content

#### Partial / Missing Required Fields (4 tests)
- ❌ rejects when all required fields missing
- ❌ rejects when multiple required fields missing
- ❌ rejects when some but not all required fields present
- ❌ rejects partial github input (action without username)

---

### Watcher Pure-Helper Tests (10)

Tests pure functions from `src/watcher.ts` — no filesystem I/O.

- ✅ `formatAgo()` formats seconds, minutes, hours correctly
- ✅ `computeStalenessNote()` returns empty when file not in map
- ✅ `computeStalenessNote()` returns note when file is stale
- ✅ `selectRecent()` returns files modified within window
- ✅ `selectRecent()` excludes files outside window
- ✅ `selectRecent()` caps at max-file limit
- ✅ `selectRecent()` sorts by most-recently-modified first
- ✅ `getStalenessNote()` is empty when watcher not started
- ✅ `getRecentlyModified()` returns empty array before start
- ✅ `markRead()` removes file from recently-modified list

---

### Privacy / No-History Tests (15)

Tests the `--no-history` ephemeral mode and the `/privacy` mid-session toggle.

- ✅ `isEphemeral()` defaults to false
- ✅ `setEphemeral(true)` sets the flag
- ✅ `setEphemeral(false)` clears the flag
- ✅ `saveHistory()` is a no-op in ephemeral mode
- ✅ `saveGraph()` is a no-op in ephemeral mode
- ✅ `saveIndex()` is a no-op in ephemeral mode
- ✅ `saveHistory()` writes to disk in non-ephemeral mode
- ✅ `privacyTransition(off → on)` returns enable-warning lines
- ✅ `privacyTransition(on → off)` returns disable-warning lines
- ✅ `privacyTransition(off → off)` returns no warning
- ✅ `privacyTransition(on → on)` returns no warning
- ✅ Warning mentions that past turns are NOT erased when enabling
- ✅ Warning mentions that past turns WILL be written when disabling
- ✅ Ephemeral flag is isolated — module-level singleton, no cross-test bleed
- ✅ `setEphemeral` is idempotent (calling twice with same value is safe)

---

### Export Command Tests (23)

Tests the `/export` conversation formatter for Markdown, JSON, and HTML output.

- ✅ Markdown export includes message content
- ✅ Markdown export labels `user` / `assistant` roles correctly
- ✅ Markdown export includes timestamps
- ✅ Markdown export includes session header
- ✅ JSON export is valid parseable JSON
- ✅ JSON export includes all messages
- ✅ JSON export preserves role and content fields
- ✅ JSON export includes session metadata
- ✅ HTML export is well-formed (opens and closes `<html>`)
- ✅ HTML export includes message content
- ✅ HTML export applies role-based CSS classes
- ✅ HTML export includes a `<title>` element
- ✅ Empty conversation exports gracefully (no crash)
- ✅ System messages are excluded from export
- ✅ Tool call messages are excluded from export
- ✅ Long messages are not truncated
- ✅ Special characters are escaped in HTML output
- ✅ Unicode content preserved in all three formats
- ✅ Filename follows `clic-export-<date>.<ext>` convention
- ✅ Markdown format is the default when format is unspecified
- ✅ Unknown format argument falls back to Markdown
- ✅ Export formatter is pure — does not write to disk
- ✅ `runExportTests()` returns `{ passed, failed }` shape

---

### Terminal Module Tests (33)

Tests pure helpers and `TerminalManager` integration (requires node-pty).

#### `stripAnsi` — pure (8 tests)
- ✅ strips CSI reset sequence (`\x1B[0m`)
- ✅ strips CSI colour codes (`\x1B[32m...\x1B[0m`)
- ✅ strips OSC window-title (`\x1B]2;title\x07`)
- ✅ strips OSC with ST terminator (`\x1B]0;title\x1B\\`)
- ✅ strips bare ESC character
- ✅ strips carriage returns (`\r`)
- ✅ leaves plain text untouched
- ✅ mixed input: strips all escapes, keeps text

#### `RingBuffer` — pure (5 tests)
- ✅ `tail(3)` returns last 3 lines
- ✅ `tail(3)` after overflow returns last 3 (evicts oldest)
- ✅ `tail(10)` is capped to lines available
- ✅ `tail()` after `clear()` returns empty string
- ✅ pending chars joined across chunks (`push('a\nb')` + `push('c\nd\n')`)

#### `assertValidTerminalName` — pure (4 tests)
- ❌ rejects empty string
- ❌ rejects name longer than 32 characters (regex: `^[a-zA-Z0-9_-]{1,32}$`)
- ❌ rejects names with spaces or special characters
- ✅ accepts valid name (`valid-name_01`)

#### `TerminalManager` — integration (16 tests)
- ✅ exec auto-spawns terminal on demand and returns output
- ✅ exec exit code 0 on success
- ✅ exec `timedOut` is false on success
- ✅ exec `terminal` field matches the name passed
- ✅ shell cwd persists across exec calls (`cd /tmp` then `pwd`)
- ✅ non-zero exit code captured correctly (`(exit 7)` → exitCode 7)
- ✅ `list()` includes spawned terminal
- ✅ `has()` returns true for live terminal
- ✅ `get()` returns `TerminalInfo` with `status` field
- ✅ `read()` returns buffered output string
- ✅ `waitFor()` resolves on pattern match (`matched: true`)
- ✅ `waitFor()` `timedOut` is false on successful pattern match
- ✅ `waitFor()` times out when pattern is never present
- ✅ `has()` returns false after kill
- ✅ `kill()` throws for unknown terminal name
- ✅ `killAll()` on empty pool completes without error

---

## Architecture

### Module Responsibilities

| File | Role |
|---|---|
| `test-helpers.ts` | `validateToolSchema()`, `runTestCase()`, `runTestSuite()`, `TestCase` interface |
| `zod-validation.test.ts` | Core `executeTool()` boundary — 18 fundamental scenarios |
| `tool-schemas.test.ts` | Per-tool schema rules — 9 tools, 37 cases total |
| `edge-cases.test.ts` | Boundary conditions, type coercion, special chars — 27 cases |
| `watcher.test.ts` | Pure watcher helpers — 10 cases, no filesystem I/O |
| `privacy.test.ts` | Ephemeral mode + `/privacy` toggle — 15 cases |
| `export.test.ts` | Conversation export formatter — 23 cases |
| `terminal.test.ts` | Terminal pure helpers + PTY integration — 33 cases |
| `index.ts` | Orchestrates all suites, aggregates totals, exits 0/1 |

### Key Design Principles
- **Schema-only for Zod suites**: no tool execution, no side effects
- **Pure helpers tested in isolation**: watcher, terminal pure functions need no I/O
- **Integration tests self-contained**: terminal integration spawns and kills its own PTYs
- **Modular imports**: every suite independently runnable via `pnpm test:<suite>`
- **Aggregated totals**: `index.ts` sums all suites and prints a single summary

---

## Test Execution Flow

```
pnpm test
  ↓
test/index.ts (main runner)
  ├→ runValidationGateTests()   →  18 cases
  ├→ runToolSchemaTests()
  │   ├→ read_file              →   4 cases
  │   ├→ write_file             →   5 cases
  │   ├→ append_file            →   3 cases
  │   ├→ modify_file            →   5 cases
  │   ├→ list_directory         →   3 cases
  │   ├→ run_command            →   4 cases
  │   ├→ search_files           →   4 cases
  │   ├→ web_search             →   3 cases
  │   └→ github                 →   6 cases  (37 total)
  ├→ runEdgeCaseTests()         →  27 cases
  ├→ runWatcherTests()          →  10 cases
  ├→ runPrivacyTests()          →  15 cases
  ├→ runExportTests()           →  23 cases
  └→ runTerminalTests()         →  33 cases
  ↓
Summary report (163 total)
  ↓
Exit code: 0 (all pass) or 1 (any fail)
```

---

## Test Output Example

```
╔════════════════════════════════════════════════════════════════════════════╗
║                          TEST SUITE SUMMARY                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Validation Gate Tests        : 18 passed, 0  failed                      ║
║  Tool Schema Tests            : 37 passed, 0  failed                      ║
║  Edge Case Tests              : 27 passed, 0  failed                      ║
║  Watcher Pure-Helper Tests    : 10 passed, 0  failed                      ║
║  Privacy / No-History Tests   : 15 passed, 0  failed                      ║
║  Export Command Tests         : 23 passed, 0  failed                      ║
║  Terminal Module Tests        : 33 passed, 0  failed                      ║
║                                                                            ║
║  ─────────────────────────────────────────────────────────────────────    ║
║  TOTAL                        : 163 passed, 0  failed (163 tests)         ║
║                                                                            ║
║  ✅ ALL TESTS PASSED — Zod validation is working perfectly!               ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## Adding New Tests

### Test Case Format (Zod suites)
```typescript
{
  description: "accepts valid filepath",
  toolName: "read_file",
  input: { filepath: "file.ts" },
  shouldValidate: true  // or false
}
```

### Steps to Add
1. Add the test case to the appropriate file:
   - Core `executeTool()` boundary → `zod-validation.test.ts`
   - Tool-specific schema rules → `tool-schemas.test.ts`
   - Boundary/type-coercion scenario → `edge-cases.test.ts`
   - Watcher pure helper → `watcher.test.ts`
   - Privacy/ephemeral behaviour → `privacy.test.ts`
   - Export formatter → `export.test.ts`
   - Terminal helper or PTY integration → `terminal.test.ts`

2. No other changes needed — the suite runner picks it up on the next `pnpm test`.

### Example: Add a `terminal` tool schema test
```typescript
// In tool-schemas.test.ts
const terminalTests: TestCase[] = [
  {
    description: 'valid create action',
    toolName: 'terminal',
    input: { action: 'create', name: 'dev' },
    shouldValidate: true
  },
  {
    description: 'rejects unknown action',
    toolName: 'terminal',
    input: { action: 'destroy', name: 'dev' },
    shouldValidate: false
  }
];
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "test":                  "tsx test/index.ts",
    "test:zod":              "tsx test/index.ts",
    "test:validation-gate":  "tsx -e \"import { runValidationGateTests } from './test/zod-validation.test.js'; runValidationGateTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:schemas":          "tsx -e \"import { runToolSchemaTests } from './test/tool-schemas.test.js'; runToolSchemaTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:edge-cases":       "tsx -e \"import { runEdgeCaseTests } from './test/edge-cases.test.js'; runEdgeCaseTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:watcher":          "tsx -e \"import { runWatcherTests } from './test/watcher.test.js'; runWatcherTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:privacy":          "tsx -e \"import { runPrivacyTests } from './test/privacy.test.js'; runPrivacyTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:export":           "tsx -e \"import { runExportTests } from './test/export.test.js'; runExportTests().then(r => process.exit(r.failed > 0 ? 1 : 0))\"",
    "test:terminal":         "tsx test/terminal.test.ts"
  }
}
```

---

## Performance

- **163 tests total**
- **Zod suites (130 tests)**: ~500ms — pure in-memory schema validation, no I/O
- **Terminal suite (33 tests)**: ~2–5 s — spawns real PTY processes via node-pty
- **Per-test average (Zod)**: ~4ms
- **Per-test average (terminal)**: ~100–200ms (PTY spawn overhead)

---

## Troubleshooting

### Import errors
```bash
pnpm install          # ensure node-pty prebuilds are present
cd /path/to/CLIC-Agentic-CLI-like-Code-Claude
pnpm test
```

### Terminal tests fail with `node-pty` error
node-pty requires native prebuilds. If they are missing or built for the wrong Node version:
```bash
pnpm rebuild          # rebuild native addons for current Node version
```
Alternatively, run only the non-PTY suites:
```bash
pnpm test:validation-gate && pnpm test:schemas && pnpm test:edge-cases \
  && pnpm test:watcher && pnpm test:privacy && pnpm test:export
```

### Tests failing unexpectedly
1. Check the tool's Zod schema in `src/tools/<tool>.ts`.
2. Verify constraints (`min:1`, `optional()`, enum values).
3. See `test/utils/test-helpers.ts` for the `validateToolSchema()` implementation.

---

## Future Enhancements

- [ ] Add watch mode (`--watch` flag)
- [ ] Add coverage reporting (schema coverage %)
- [ ] Add test grouping/filtering by tool name or suite
- [ ] Integrate with CI/CD pipeline

---

**Last Updated**: September 4, 2026  
**Status**: Production Ready ✅  
**Test Suite Version**: 2.0.0
