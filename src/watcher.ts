// ─────────────────────────────────────────────────────────────────────────────
//  Watcher — singleton workspace file watcher (chokidar)
//
//  Tracks externally-modified files in a rolling window for:
//    • ambient system-prompt context (getRecentlyModified)
//    • inline staleness notes on read_file (getStalenessNote)
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import { createRequire } from 'node:module';
import chalk from 'chalk';
import type { FSWatcher } from 'chokidar';

const require = createRequire(import.meta.url);

// ── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_WINDOW_MS = 900_000; // 15 minutes
const LIST_CAP = 50;               // generous cap; prompt builder shows only 5

// ── Internal state (module-level, not exported) ──────────────────────────────
const recentlyModified = new Map<string, number>(); // abs filepath → last external change ts
const agentLastSeen    = new Map<string, number>(); // abs filepath → last agent read/write ts
let watcherInstance: FSWatcher | null = null;
let watchRoot = process.cwd();

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function formatAgo(elapsedMs: number): string {
  if (elapsedMs < 60_000) return 'just now';
  const mins = Math.floor(elapsedMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}

export function computeStalenessNote(
  relPath: string,
  modifiedTs: number | undefined,
  lastSeenTs: number | undefined,
  nowTs: number,
): string | null {
  if (modifiedTs === undefined || lastSeenTs === undefined) return null;
  if (modifiedTs <= lastSeenTs) return null;
  return `[Note: ${relPath} was modified externally ${formatAgo(nowTs - modifiedTs)} — this may differ from your last read]`;
}

export function selectRecent(
  entries: Array<[string, number]>,
  nowTs: number,
  windowMs: number,
  cap: number,
): Array<{ path: string; ago: string }> {
  return entries
    .filter(([, ts]) => nowTs - ts <= windowMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([p, ts]) => ({ path: p, ago: formatAgo(nowTs - ts) }));
}

// ── Stateful exports ─────────────────────────────────────────────────────────

export function startWatcher(cwd: string): void {
  if (watcherInstance) return; // no-op if already running
  watchRoot = cwd;
  try {
    // Synchronous require inside try/catch so a missing chokidar install
    // degrades gracefully instead of crashing the app at module load
    // (spec Error-Handling table: "chokidar import fails").
    const chokidar = require('chokidar');
    watcherInstance = chokidar.watch(cwd, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.log',
        '**/chat_history.json',
        '**/token_graph.json',
        '**/sessions/**',
        '**/*.bak',
      ],
      depth: 4,
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
    });
    const record = (fp: string) => { recentlyModified.set(path.resolve(fp), Date.now()); };
    watcherInstance!
      .on('change', record)
      .on('add', record)
      .on('error', () => { /* swallow — degrade gracefully */ });
    console.log(chalk.dim('  ✅ File watcher: Active (CWD, depth 4, 15-min window)'));
  } catch {
    watcherInstance = null;
    console.log(chalk.dim('  ⚡ File watcher: unavailable — continuing without watching.'));
  }
}

export function stopWatcher(): void {
  if (watcherInstance) {
    try { void watcherInstance.close(); } catch { /* ignore */ }
    watcherInstance = null;
  }
}

export function markRead(filepath: string): void {
  try { agentLastSeen.set(path.resolve(filepath), Date.now()); } catch { /* ignore */ }
}

export function getStalenessNote(filepath: string): string | null {
  try {
    const abs = path.resolve(filepath);
    const rel = path.relative(watchRoot, abs) || abs;
    return computeStalenessNote(rel, recentlyModified.get(abs), agentLastSeen.get(abs), Date.now());
  } catch {
    return null;
  }
}

export function getRecentlyModified(windowMs = DEFAULT_WINDOW_MS): Array<{ path: string; ago: string }> {
  try {
    const now = Date.now();
    // Trim expired entries so the map stays bounded.
    for (const [fp, ts] of recentlyModified) {
      if (now - ts > windowMs) recentlyModified.delete(fp);
    }
    const entries: Array<[string, number]> = [...recentlyModified].map(
      ([fp, ts]) => [path.relative(watchRoot, fp) || fp, ts],
    );
    // Return the full in-window list (up to LIST_CAP); buildSystemPrompt
    // handles the display cap of 5 + "...and N more".
    return selectRecent(entries, now, windowMs, LIST_CAP);
  } catch {
    return [];
  }
}
