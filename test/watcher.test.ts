/**
 * Watcher pure-helper tests — no timers, no fs. Run with: pnpm test:watcher
 */
import { formatAgo, computeStalenessNote, selectRecent } from '../src/watcher.js';
import { pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

export async function runWatcherTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nWatcher Pure-Helper Tests');

  // formatAgo
  eq('formatAgo < 1 min → just now', formatAgo(30_000), 'just now');
  eq('formatAgo 2 min', formatAgo(120_000), '2 min ago');
  eq('formatAgo 59 min', formatAgo(59 * 60_000), '59 min ago');
  eq('formatAgo 2 hr', formatAgo(2 * 3_600_000), '2 hr ago');

  // computeStalenessNote
  const now = 1_000_000;
  eq('note fires when modified after lastSeen',
     computeStalenessNote('src/a.ts', now - 180_000, now - 300_000, now),
     '[Note: src/a.ts was modified externally 3 min ago — this may differ from your last read]');
  eq('no note when never read (lastSeen undefined)',
     computeStalenessNote('src/a.ts', now - 120_000, undefined, now), null);
  eq('no note when never modified (modified undefined)',
     computeStalenessNote('src/a.ts', undefined, now - 300_000, now), null);
  eq('no note when read is newer than modification',
     computeStalenessNote('src/a.ts', now - 300_000, now - 120_000, now), null);

  // selectRecent
  const entries: Array<[string, number]> = [
    ['src/old.ts', now - 20 * 60_000],   // outside 15-min window
    ['src/a.ts',   now - 2 * 60_000],
    ['src/b.ts',   now - 8 * 60_000],
  ];
  eq('selectRecent filters window, sorts recent-first, caps',
     selectRecent(entries, now, 900_000, 5),
     [{ path: 'src/a.ts', ago: '2 min ago' }, { path: 'src/b.ts', ago: '8 min ago' }]);
  eq('selectRecent respects cap',
     selectRecent([['x', now - 1000], ['y', now - 2000], ['z', now - 3000]], now, 900_000, 2).length, 2);

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Allow direct execution: tsx test/watcher.test.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWatcherTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
