/**
 * Privacy / --no-history ephemeral-mode tests.
 * Verifies that when ephemeral mode is on, the disk-write functions become no-ops,
 * while reads (loadHistory) still work. Run with: pnpm test:privacy
 *
 * Uses isolated temp files — never touches the real chat_history/token_graph/sessions files.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setEphemeral, isEphemeral } from '../src/privacy.js';
import {
  setHistoryFile, saveHistory, loadHistory,
  pushMessage, clearMessages, getMessages,
} from '../src/memory.js';
import { saveGraph } from '../src/knowledgeGraph.js';
import { privacyTransition } from '../src/commands/privacy.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function rm(p: string): Promise<void> {
  try { await fs.rm(p, { force: true }); } catch { /* ignore */ }
}

export async function runPrivacyTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nPrivacy / --no-history Ephemeral-Mode Tests');

  const tmp = os.tmpdir();
  const histFile = path.join(tmp, `clic-test-history-${process.pid}.json`);
  const graphFile = path.join(tmp, `clic-test-graph-${process.pid}.json`);
  const loadFile = path.join(tmp, `clic-test-load-${process.pid}.json`);

  try {
    // ── Flag toggle ──
    setEphemeral(true);
    eq('isEphemeral() true after setEphemeral(true)', isEphemeral(), true);
    setEphemeral(false);
    eq('isEphemeral() false after setEphemeral(false)', isEphemeral(), false);

    // ── saveHistory: no write when ephemeral ──
    await rm(histFile);
    setHistoryFile(histFile);
    clearMessages();
    pushMessage({ role: 'user', content: 'secret' });
    setEphemeral(true);
    await saveHistory();
    eq('saveHistory writes nothing when ephemeral', await exists(histFile), false);

    // ── saveHistory: writes when NOT ephemeral ──
    setEphemeral(false);
    await saveHistory();
    eq('saveHistory writes when not ephemeral', await exists(histFile), true);

    // ── saveGraph: no write when ephemeral ──
    await rm(graphFile);
    setEphemeral(true);
    await saveGraph(graphFile);
    eq('saveGraph writes nothing when ephemeral', await exists(graphFile), false);

    // ── saveGraph: writes when NOT ephemeral ──
    setEphemeral(false);
    await saveGraph(graphFile);
    eq('saveGraph writes when not ephemeral', await exists(graphFile), true);

    // ── loadHistory: still reads when ephemeral (context loaded once) ──
    await fs.writeFile(loadFile, JSON.stringify([
      { role: 'user', content: 'prior-1' },
      { role: 'assistant', content: 'prior-2' },
    ]), 'utf-8');
    clearMessages();
    setHistoryFile(loadFile);
    setEphemeral(true);
    await loadHistory();
    eq('loadHistory still populates messages when ephemeral', getMessages().length, 2);

    // ── /privacy command: privacyTransition (pure) ──
    const offToOn = privacyTransition(false, true);
    eq('off→on is a change', offToOn.changed, true);
    eq('off→on warns that already-saved turns remain on disk',
       offToOn.lines.some(l => /on disk/i.test(l)), true);

    const onToOff = privacyTransition(true, false);
    eq('on→off is a change', onToOff.changed, true);
    eq('on→off warns the in-memory history will be written',
       onToOff.lines.some(l => /in-memory history|will be written/i.test(l)), true);

    eq('on→on is not a change', privacyTransition(true, true).changed, false);
    eq('off→off is not a change', privacyTransition(false, false).changed, false);

    // ── /privacy command: applying a selection flips the singleton ──
    setEphemeral(false);
    if (privacyTransition(isEphemeral(), true).changed) setEphemeral(true);
    eq('selecting On enables ephemeral', isEphemeral(), true);
    if (privacyTransition(isEphemeral(), false).changed) setEphemeral(false);
    eq('selecting Off disables ephemeral', isEphemeral(), false);
  } finally {
    // Never leak ephemeral state into other suites.
    setEphemeral(false);
    clearMessages();
    await rm(histFile);
    await rm(graphFile);
    await rm(loadFile);
  }

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Allow direct execution: tsx test/privacy.test.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivacyTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
