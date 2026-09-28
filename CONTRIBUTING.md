# Contributing to CLIC

Thank you for taking the time to contribute! CLIC is open-source and welcomes bug reports, feature suggestions, and pull requests from everyone.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Branch Naming Convention](#branch-naming-convention)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Coding Standards](#coding-standards)
- [Running Tests](#running-tests)
- [Documentation and Community Files](#documentation-and-community-files)
- [Adding a New Tool](#adding-a-new-tool)
- [Adding a New Slash Command](#adding-a-new-slash-command)
- [Commit Message Format](#commit-message-format)

---

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md). Please keep interactions respectful and constructive.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/CLIC-Agentic-CLI-like-Code-Claude.git
   cd CLIC-Agentic-CLI-like-Code-Claude
   ```
3. **Add the upstream remote** so you can pull in future changes:
   ```bash
   git remote add upstream https://github.com/UdaySharmaGitHub/CLIC-Agentic-CLI-like-Code-Claude.git
   ```

---

## Development Setup

**Prerequisites:** Node.js >= 20 (Node.js 22 LTS or newer is recommended), pnpm 10 or newer

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env and add your API_KEY

# Run in development mode (no build step needed)
pnpm dev
```

TypeScript is checked with `pnpm typecheck`, and the production bundle is validated with `pnpm build`.

---

## How to Contribute

### Reporting Bugs

Before opening a bug report, please:
- Search [existing issues](https://github.com/UdaySharmaGitHub/CLIC-Agentic-CLI-like-Code-Claude/issues) to avoid duplicates.
- Reproduce the issue on the latest `main` branch.

When filing an issue, use the **Bug Report** template and include:
- Node.js version (`node --version`)
- pnpm version (`pnpm --version`)
- OS + shell
- The exact command you ran
- Full terminal output (paste the error, not a screenshot)

### Suggesting Features

Open a **Feature Request** issue describing:
- The problem you're trying to solve
- Your proposed solution
- Alternatives you considered

### Branch Naming Convention

All branches must follow this pattern:

```
<type>/<short-descriptive-name-in-kebab-case>
```

| Type | When to use | Example |
|---|---|---|
| `feature/` | Adding new functionality | `feature/add-web-search-tool` |
| `fix/` or `bug/` | Bug fixes | `fix/terminal-hang-on-exit` |
| `migration/` | Architecture or provider migrations | `migration/multi-terminal-parallel-processing-architecture` |
| `testing/` | Adding or updating test files only | `testing/updating-testcases-files` |
| `infra/` | Build, CI, config, or tooling changes | `infra/add-github-actions-ci` |
| `documentation/` | Documentation-only changes | `documentation/update-contributing-guide` |

Real branch names from this project for reference:
```
feature/add-no-history-privacy-flag-for-ephemeral-sessions
feature/context-window-guard-auto-compaction
feature/export-conversation
feature/named-sessions-multi-session-context-history-management
feature/workspace-file-watching-ambient-file-change-awareness
feature/zod-tool-input-validation
migration/multi-terminal-parallel-processing-architecture
testing/updating-testcases-files
documentation/open-source-contribution
```

> Use a descriptive, lowercase, hyphen-separated name that makes the branch purpose obvious from the name alone. Avoid short/vague names like `fix/bug` or `feature/update`.

---

### Submitting Pull Requests

1. **Create a branch** from `main` following the naming convention above.

   Using `git checkout` (classic):
   ```bash
   git checkout -b feature/add-my-new-tool
   git checkout -b fix/terminal-hang-on-exit
   git checkout -b testing/add-tool-schema-tests
   ```

   Using `git switch` (modern, preferred):
   ```bash
   git switch -c feature/add-my-new-tool
   git switch -c fix/terminal-hang-on-exit
   git switch -c testing/add-tool-schema-tests
   ```

   Both do the same thing — create and switch to the new branch. Use whichever you prefer.

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Run all checks locally** and make sure everything passes before pushing:
   ```bash
   pnpm typecheck    # TypeScript type check
   pnpm build        # Production bundle — catches compile errors
   pnpm test         # Runs ALL 7 test suites via test/index.ts
   ```
   All three must pass. Do not open a PR with failing tests or type errors.

   > **Note:** Individual commands like `pnpm test:watcher` or `pnpm test:privacy` are development shortcuts to run a single suite in isolation. You do not need to run them separately before a PR — `pnpm test` already covers everything.

4. **Push** your branch and open a PR against `main`:
   ```bash
   git push origin feature/add-my-new-tool
   ```

5. Fill in the **PR template** completely — describe what changed and why, and include steps to verify.

6. A maintainer will review your PR. Please be responsive to feedback.

> **Tip:** For large changes or new features, open an issue first to discuss the approach before writing code.

---

## Coding Standards

- **Language:** TypeScript (ESM, strict mode)
- **Formatting:** No formatter is enforced yet — match the style of the surrounding code.
- **Validation:** Run `pnpm typecheck`, `pnpm build`, and `pnpm test` before opening a pull request.
- **Types:** Prefer explicit types over `any`. All tool inputs must have a `z.ZodObject` schema alongside the `ToolDefinition`.
- **Comments:** Write comments only when the *why* is non-obvious. Do not narrate what the code does.
- **Error handling:** Validate at system boundaries (user input, external APIs). Trust internal code and framework guarantees elsewhere.
- **No new dependencies** without prior discussion in an issue.

---

## Running Tests

```bash
pnpm test                       # Full Zod input-validation suite
pnpm test:validation-gate       # Validation-gate tests
pnpm test:schemas               # Tool schema shape tests
pnpm test:edge-cases            # Edge-case tests
pnpm test:watcher               # Watcher pure-helper tests
pnpm test:privacy               # Privacy / ephemeral-mode tests
pnpm test:export                # Conversation export formatter tests
pnpm test:terminal              # Terminal module tests
pnpm typecheck                  # Strict TypeScript check
pnpm build                      # Production bundle check
```

All tests must pass before a PR can be merged.

---

## Documentation and Community Files

When a change affects user workflows, update the relevant README or feature documentation. Use the issue templates for bug reports and feature requests, and complete the pull request template so reviewers can reproduce and validate the change. Security vulnerabilities should be reported privately according to [SECURITY.md](SECURITY.md).

---

## Adding a New Tool

See the [Adding a New Tool](README.md#adding-a-new-tool) section in the README for the full walkthrough. In short:

1. Create `src/tools/myTool.ts` — export `definition` (with `schema`) and `execute`.
2. Register it in `src/tools/index.ts`.
3. Add a test case in `test/tool-schemas.test.ts` covering schema shape and at least one validation-gate failure.

---

## Adding a New Slash Command

See the [Adding a New Command](README.md#adding-a-new-command) section in the README. In short:

1. Create `src/commands/myCmd.ts` — export `command: SlashCommand`.
2. Register it in `src/commands/index.ts`.

---

## Commit Message Format

Use the following prefixes:

| Prefix | When to use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring with no behavior change |
| `test:` | Adding or fixing tests |
| `docs:` | Documentation only |
| `chore:` | Build, config, or tooling changes |

Example:
```
feat: add ratelimit retry to web_search tool

Previously web_search would throw on 429. This wraps it in the
existing withRetry() helper so it benefits from the same backoff
as the main LLM call.
```

---

Thank you for contributing to CLIC!
