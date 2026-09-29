# Dependabot — Automated Dependency Updates

> Dependabot is a GitHub-managed bot that automatically opens Pull Requests to keep CLIC's dependencies up to date and security-patched — without any manual intervention.

## Table of Contents

- [Overview](#overview)
- [How it works](#how-it-works)
- [Branch & PR lifecycle](#branch--pr-lifecycle)
- [CI integration](#ci-integration)
- [Configuration reference](#configuration-reference)
- [PR grouping strategy](#pr-grouping-strategy)
- [Auto-merge — default behaviour & options](#auto-merge--default-behaviour--options)
- [What Dependabot is NOT](#what-dependabot-is-not)
- [Recommended merge strategy for CLIC](#recommended-merge-strategy-for-clic)
- [Future enhancements](#future-enhancements)

---

## Overview

Before Dependabot, dependency updates only happened when something broke — by which point a known CVE (security vulnerability) might already be in published code. Dependabot solves this by scanning `package.json` and `pnpm-lock.yaml` every week and opening a PR for each package that has a newer version available.

CLIC's key dependencies and why they matter:

| Package | Risk without updates |
|---|---|
| `openai` | API breaking changes, auth changes go unnoticed |
| `node-pty` | Native module — security patches need fast adoption |
| `zod` | v4→v5 migration could break tool schemas silently |
| `@types/node` | Type drift causes hidden `pnpm typecheck` failures |

---

## How it works

Dependabot is **not a GitHub Actions workflow**. It is a separate GitHub platform service — a built-in bot that GitHub runs on its own infrastructure on a schedule.

```
GitHub's Dependabot service (runs independently, not in Actions)
    │
    ├── Reads .github/dependabot.yml        ← your config file
    ├── Scans package.json + pnpm-lock.yaml
    ├── Compares against npm registry
    └── For each outdated package → opens a PR
```

The key distinction:

| | GitHub Actions (`.github/workflows/`) | Dependabot (`.github/dependabot.yml`) |
|---|---|---|
| **What it is** | CI/CD runner you write yourself | Built-in GitHub bot |
| **Who runs it** | GitHub Actions runner (a VM) | GitHub's Dependabot service |
| **Triggered by** | Events you define (`push`, `pull_request`, etc.) | GitHub's internal weekly scheduler |
| **What it does** | Runs arbitrary shell commands | Only opens PRs to update dependencies |
| **Config location** | `.github/workflows/*.yml` | `.github/dependabot.yml` (fixed, hardcoded) |

The `.github/dependabot.yml` location is **hardcoded by GitHub** — it cannot be placed anywhere else. You do not "run" Dependabot; you configure it and GitHub does the rest.

---

## Branch & PR lifecycle

Dependabot **always creates a separate branch** — it never pushes directly to `main`.

### Branch naming format

```
dependabot/npm_and_yarn/<package-name>-<new-version>
```

### Real examples

```
dependabot/npm_and_yarn/openai-6.38.0
dependabot/npm_and_yarn/zod-4.5.0
dependabot/npm_and_yarn/node-pty-1.2.0
dependabot/npm_and_yarn/dev-dependencies-a1b2c3d4    ← grouped PR (all devDeps)
```

### Full lifecycle — step by step

```
1. Weekly schedule fires
        │
2. Dependabot scans package.json + pnpm-lock.yaml
        │
3. Finds: openai 6.37.0 → 6.38.0 available
        │
4. Creates branch: dependabot/npm_and_yarn/openai-6.38.0
        │
        ├── Updates package.json  (6.37.0 → 6.38.0)
        └── Updates pnpm-lock.yaml
        │
5. Opens PR targeting main
        │
        ├── PR title:  "Bump openai from 6.37.0 to 6.38.0"
        ├── PR body:   auto-generated changelog + release notes link
        └── Label:     "dependencies"
        │
6. CI pipeline triggers automatically (your ci.yml runs on pull_request)
        │
        ├── Node 20 ✅
        ├── Node 22 ✅
        └── Node 26 ✅ / ⚠️
        │
7. PR sits open, waiting for manual review and merge
        │
8. You merge → dependabot branch is deleted automatically
```

### Visualised as a git graph

```
main ──────────────────────────────────────────────► (protected)
         │
         └── dependabot/npm_and_yarn/openai-6.38.0
                  commit: "Bump openai from 6.37.0 to 6.38.0"
                  └── PR #XX → targets main → CI runs → you merge
```

---

## CI integration

Every Dependabot PR triggers your `ci.yml` pipeline automatically — because `ci.yml` fires on `pull_request` targeting `main`, and Dependabot PRs target `main`.

```
Dependabot opens PR
    └── ci.yml triggers
          ├── validate (Node 20) — typecheck + build + test
          ├── validate (Node 22) — typecheck + build + test
          └── validate (Node 26) — typecheck + build + test (non-blocking)
```

This means a dependency update that breaks a type check, build, or test shows as a **failing CI check on the PR before you ever look at it**. You never merge a broken update by accident.

---

## Configuration reference

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    groups:
      dev-dependencies:
        dependency-type: development
```

| Field | Value | What it means |
|---|---|---|
| `version` | `2` | Dependabot config format version — always `2`, not a project version |
| `package-ecosystem` | `npm` | Watch `package.json` / `pnpm-lock.yaml` (pnpm uses the npm ecosystem) |
| `directory` | `/` | Root of the repo — where `package.json` lives |
| `schedule.interval` | `weekly` | Scan and open PRs once per week |
| `groups.dev-dependencies` | `dependency-type: development` | Group all `devDependencies` into one PR |

### Schedule options

| Value | Frequency | Best for |
|---|---|---|
| `daily` | Every day | High-security projects, lots of activity |
| `weekly` | Once a week | Most projects — good balance ✅ |
| `monthly` | Once a month | Minimal noise, but slow on security patches |

You can also pin the day:
```yaml
schedule:
  interval: weekly
  day: monday
```

Without `day`, GitHub picks the day automatically.

---

## PR grouping strategy

Without grouping, a single weekly scan could open 6–8 separate PRs (one per outdated package). Grouping reduces this noise.

**Current config groups all `devDependencies` into one PR:**

| Dependency type | PR behaviour | Why |
|---|---|---|
| `devDependencies` — `typescript`, `tsup`, `tsx`, `@types/node` | One grouped PR per week | Low risk, batch-mergeable |
| `dependencies` — `openai`, `node-pty`, `zod`, `chokidar`, etc. | Individual PR per package | Higher risk — review each separately |

Production dependencies get individual PRs because a `zod` major bump has very different risk from a `chalk` patch bump. Grouping them would force you to merge unrelated changes together.

---

## Auto-merge — default behaviour & options

### Default: no auto-merge

By default, after Dependabot opens a PR and CI passes, **the PR sits open waiting for you to manually review and merge**. Nothing happens automatically.

```
Dependabot PR opened
    └── CI passes ✅
          └── PR is green — but still waits for YOU to merge
```

### Option 1 — Enable auto-merge via GitHub repo settings (future)

You can configure Dependabot to auto-merge patch bumps by adding to `dependabot.yml`:

```yaml
# future addition — not currently enabled
auto-merge: patch    # only auto-merge patch version bumps (e.g. 6.37.0 → 6.37.1)
```

Requires "Allow auto-merge" to be enabled in the repo's Settings → General.

### Option 2 — Auto-merge via a separate workflow (future)

```yaml
# .github/workflows/dependabot-auto-merge.yml  (future)
on: pull_request

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: write
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.pulls.merge({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number,
              merge_method: 'squash'
            })
```

Both options are **not currently enabled** — see recommended strategy below.

---

## What Dependabot is NOT

- It is **not** a GitHub Actions workflow — it lives outside `.github/workflows/`
- It does **not** run shell commands or scripts
- It does **not** test the update itself — that is your CI pipeline's job
- It does **not** push to `main` directly — always opens a PR
- It does **not** merge anything — that is always a human decision (unless auto-merge is explicitly configured)

---

## Recommended merge strategy for CLIC

Auto-merge is not enabled and should not be added yet. Manual review is the right approach at this stage.

| Update type | Example | Recommended action |
|---|---|---|
| **Patch** | `6.37.0` → `6.37.1` | Merge quickly after CI passes — bug fixes only |
| **Minor** | `6.37.0` → `6.38.0` | Skim the changelog, then merge |
| **Major** | `6.x` → `7.x` | Read migration guide, test manually, merge carefully |
| **`node-pty`** (any) | any bump | Check prebuild availability for Node 20/22/26 first |
| **`zod`** (minor/major) | `4.x` → `5.x` | Audit all tool schemas in `src/tools/` before merging |

---

## Future enhancements

| Enhancement | When to add |
|---|---|
| Auto-merge patch bumps | When the project is stable and test coverage is high |
| Pin `day: monday` | When you want predictable PR timing |
| Add `github-actions` ecosystem | To also update `actions/checkout`, `actions/setup-node` versions automatically |
| Security-only updates | `open-pull-requests-limit` + `allow: [{dependency-type: security}]` for a stricter mode |

Adding the `github-actions` ecosystem entry is particularly useful — it would keep `actions/checkout@v4`, `pnpm/action-setup@v4`, and `actions/setup-node@v4` in `ci.yml` updated automatically:

```yaml
# future addition to dependabot.yml
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```
