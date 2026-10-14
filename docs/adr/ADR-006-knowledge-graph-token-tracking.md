# ADR-006: Knowledge Graph for Token Tracking

**Date:** 2026-10-13
**Status:** Accepted
**Deciders:** CLIC core team

---

## Context

CLIC needs to track token usage over time so users can understand their LLM spend. The data has natural relational structure: a session contains turns, each turn uses a model and calls tools, and each turn has a token usage record. We needed a storage approach that could answer queries like:

- "How many tokens did this session use in total?"
- "Which model did I use most?"
- "Which tool was called most often this week?"
- "What is my estimated USD cost across all sessions?"

---

## Decision

Implement an in-memory **Knowledge Graph** in `src/knowledgeGraph.ts` with five node types and four edge types:

```
Session -[HAS_TURN]->   Turn
Turn    -[USED_MODEL]-> Model       (singleton per model name)
Turn    -[CALLED_TOOL]-> Tool       (singleton per tool name)
Turn    -[HAS_USAGE]->  TokenUsage  { promptTokens, completionTokens, totalTokens, source }
```

The graph is serialised to `token_graph.json` after every agent turn. On startup, it is loaded back from disk. The `/tokens` command queries the graph and uses `src/pricing.ts` to compute estimated USD costs per model.

---

## Rationale

- **Graph naturally models the relationships.** Session → Turn → Model/Tool/Usage is a directed graph, not a flat table. Graph traversal makes cross-cutting queries (e.g., "all turns for model X across all sessions") straightforward.
- **No database dependency.** JSON serialisation to a local file is sufficient for a CLI tool. Adding SQLite or Postgres would be disproportionate.
- **Singleton model/tool nodes prevent duplication.** Rather than creating a new Model node per turn, the graph reuses a single node per model name and adds an edge per use. This keeps queries like "total tokens per model" trivial.
- **Extensible.** New node types or edge types can be added without changing the query interface.

---

## Alternatives Considered

- **Flat JSON log** — append one record per turn. Simple to write, hard to query. Computing "tokens by model" requires a full scan and reduce. Rejected for its query complexity at scale.
- **SQLite via `better-sqlite3`** — relational, fast, queryable with SQL. Rejected: adds a native dependency (same risk as node-pty), and the data model is small enough that a graph in memory is cheaper.
- **No tracking** — skip token tracking entirely. Rejected: cost visibility is a first-class feature of CLIC and a key differentiator from simple chat scripts.

---

## Consequences

**Positive:**
- `/tokens` can show per-session totals, all-time totals, per-model breakdowns, and tool usage in one query pass.
- The graph is append-only in practice; old data is never overwritten.
- `source: "actual" | "estimated"` on TokenUsage nodes records whether the API returned real token counts or whether CLIC estimated them at ~4 chars/token.

**Negative:**
- The entire graph is loaded into memory on startup. For very long-running installations (thousands of turns), this could become a startup cost. No pagination or lazy-load is implemented.
- JSON serialisation of a graph is verbose; `token_graph.json` can grow large over months of use.
- No migration path for graph schema changes — if node/edge types change, old data may be incompatible.

---

## References

- [`src/knowledgeGraph.ts`](../../src/knowledgeGraph.ts) — graph implementation, all node/edge types, query helpers
- [`src/pricing.ts`](../../src/pricing.ts) — `getCost()` used alongside the graph for USD estimates
- [`src/agent.ts`](../../src/agent.ts) — graph write after every agent turn
- [`src/commands/tokens.ts`](../../src/commands/tokens.ts) — `/tokens` command that queries the graph
