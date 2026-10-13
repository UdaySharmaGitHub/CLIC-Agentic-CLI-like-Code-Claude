# ADR-002: ESM-Only Build Output

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

CLIC is a Node.js CLI tool written in TypeScript. When compiling to JavaScript, the build tool (tsup) can emit CommonJS (`require`/`module.exports`), ES Modules (`import`/`export`), or both. We needed to choose one.

At the time of this decision, Node.js 20 LTS had stable, production-ready ESM support. Key dependencies — `chalk`, `@clack/prompts`, `chokidar` — had already moved to ESM-only distributions. Shipping CJS would require bundling or patching these packages, or staying on older versions.

---

## Decision

Set `"type": "module"` in `package.json` and configure tsup to emit ESM only (`format: ['esm']`). All source files use `import`/`export` syntax. The compiled output in `dist/` is ESM.

---

## Rationale

- **Dependency alignment.** Several key dependencies ship ESM-only. A CJS build would require dynamic `import()` shims or pinning to older, potentially unmaintained versions.
- **Top-level `await`.** CLIC's startup sequence (setup wizard, model list fetch, watcher init) benefits from top-level `await` without wrapping everything in an async IIFE.
- **Simpler build.** A single format means one output directory, no interop shims, and a one-liner build script (`tsup src/index.ts --format esm --clean` in `package.json`).
- **Forward compatibility.** The Node.js ecosystem is converging on ESM. ESM-only now avoids a forced migration later.

---

## Alternatives Considered

- **CJS only** — would work today but require shims for ESM-only dependencies and prevent top-level `await`. Rejected.
- **Dual build (CJS + ESM)** — doubles build complexity, output size, and potential for import/require interop bugs. CLIC is a CLI, not a library, so there are no consumers that need CJS. Rejected.
- **Bundled single file** — tsup can produce a single `index.js` bundle. Considered for distribution simplicity but rejected because it complicates source maps and startup-time debugging.

---

## Consequences

**Positive:**
- Build configuration is minimal (`tsup.config.ts` is ~10 lines).
- No `__dirname`/`__filename` workarounds needed; use `import.meta.url` instead.
- Compatible with the Node.js native test runner and ESM-aware tooling.

**Negative:**
- CLIC cannot be `require()`'d from a CommonJS context (not a use case, but worth noting).
- `tsx` (used by `pnpm dev`) handles ESM transparently at runtime; compiled output requires Node.js ≥ 18.

---

## References

- [`package.json`](../../package.json) — `"type": "module"` field and `"build": "tsup src/index.ts --format esm --clean"` script
- [`tsconfig.json`](../../tsconfig.json) — TypeScript compiler configuration
- [`src/index.ts`](../../src/index.ts) — entry point (ESM `import` syntax throughout)
