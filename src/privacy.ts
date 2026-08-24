// ─────────────────────────────────────────────────────────────────────────────
//  Privacy — runtime "ephemeral session" flag (--no-history)
//
//  Single source of truth for privacy mode. When enabled, the disk-write functions
//  in memory.ts, knowledgeGraph.ts, and session.ts become no-ops, so nothing is
//  persisted for the duration of the run. Reads are always allowed.
//
//  No imports here on purpose — keeps this module dependency-free so the persistence
//  modules can import it without risking a circular dependency.
// ─────────────────────────────────────────────────────────────────────────────

let ephemeral = false;

/** Enable or disable ephemeral (no-disk-writes) mode for this session. */
export function setEphemeral(value: boolean): void {
  ephemeral = value;
}

/** True when the session is ephemeral — callers must skip all disk writes. */
export function isEphemeral(): boolean {
  return ephemeral;
}
