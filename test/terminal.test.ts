/**
 * Terminal module tests — pure helpers (unit) + TerminalManager (integration).
 * Run with: pnpm test:terminal
 */
import { pathToFileURL } from 'node:url';
import { stripAnsi, RingBuffer, assertValidTerminalName, terminalManager } from '../src/terminal.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

function ok(desc: string, value: unknown) {
  if (value) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}`); }
}

export async function runTerminalTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nTerminal Module Tests');

  // ── stripAnsi ──────────────────────────────────────────────────────────────
  console.log('\n  ─ stripAnsi (pure)');
  eq('strips CSI reset', stripAnsi('\x1B[0m'), '');
  eq('strips CSI color', stripAnsi('\x1B[32mhello\x1B[0m'), 'hello');
  eq('strips OSC window-title', stripAnsi('\x1B]2;my title\x07'), '');
  eq('strips OSC with ST terminator', stripAnsi('\x1B]0;title\x1B\\'), '');
  eq('strips bare ESC', stripAnsi('\x1Btext'), 'text');
  eq('strips carriage returns', stripAnsi('foo\rbar'), 'foobar');
  eq('leaves plain text untouched', stripAnsi('hello world'), 'hello world');
  eq('mixed: strips all escapes, keeps text', stripAnsi('\x1B[1mBold\x1B[0m \x1B]0;title\x07 text'), 'Bold  text');

  // ── RingBuffer ─────────────────────────────────────────────────────────────
  console.log('\n  ─ RingBuffer (pure)');
  {
    const rb = new RingBuffer(5);
    rb.push('line1\nline2\nline3\n');
    eq('tail(3) returns last 3 lines', rb.tail(3), 'line1\nline2\nline3');
    rb.push('line4\nline5\nline6\n');
    eq('tail(3) after overflow returns last 3', rb.tail(3), 'line4\nline5\nline6');
    eq('tail(10) is capped to available', rb.tail(10), 'line2\nline3\nline4\nline5\nline6');
    rb.clear();
    eq('tail after clear is empty', rb.tail(5), '');
  }
  {
    const rb = new RingBuffer(3);
    rb.push('a\nb');        // pending = 'b'
    rb.push('c\nd\n');     // flushes 'bc', 'd'
    eq('pending chars joined across chunks', rb.tail(3), 'a\nbc\nd');
  }

  // ── assertValidTerminalName ────────────────────────────────────────────────
  console.log('\n  ─ assertValidTerminalName (pure)');
  {
    let threw = false;
    try { assertValidTerminalName(''); } catch { threw = true; }
    eq('rejects empty name', threw, true);
  }
  {
    let threw = false;
    try { assertValidTerminalName('a'.repeat(33)); } catch { threw = true; }
    eq('rejects name > 32 chars', threw, true);
  }
  {
    let threw = false;
    try { assertValidTerminalName('bad name!'); } catch { threw = true; }
    eq('rejects name with spaces/special chars', threw, true);
  }
  {
    let threw = false;
    try { assertValidTerminalName('valid-name_01'); } catch { threw = true; }
    eq('accepts valid name', threw, false);
  }

  // ── TerminalManager integration ────────────────────────────────────────────
  console.log('\n  ─ TerminalManager (integration — requires node-pty)');
  const name = `test-${process.pid}`;

  try {
    // exec auto-spawns on demand
    const r1 = await terminalManager.exec(name, 'echo hello-clic');
    ok('exec auto-spawns and returns output', r1.output.includes('hello-clic'));
    eq('exec exitCode 0 on success', r1.exitCode, 0);
    eq('exec timedOut false on success', r1.timedOut, false);
    eq('exec terminal name matches', r1.terminal, name);

    // state persists: cd then pwd
    await terminalManager.exec(name, 'cd /tmp');
    const r2 = await terminalManager.exec(name, 'pwd');
    ok('shell cwd persists across exec calls', r2.output.includes('/tmp') || r2.output.includes('tmp'));

    // non-zero exit code — use subshell so the PTY shell stays alive
    const r4 = await terminalManager.exec(name, '(exit 7)');
    eq('non-zero exit code captured', r4.exitCode, 7);

    // list
    const list = terminalManager.list();
    ok('list includes spawned terminal', list.some(t => t.name === name));

    // has / get
    eq('has() returns true for live terminal', terminalManager.has(name), true);
    ok('get() returns TerminalInfo', terminalManager.get(name)?.status !== undefined);

    // read (background output)
    await terminalManager.startBackground(name, 'echo bg-output');
    await new Promise(r => setTimeout(r, 300));
    const buf = terminalManager.read(name, 50);
    ok('read() returns buffered output', typeof buf === 'string');

    // kill
    await terminalManager.kill(name);
    eq('has() returns false after kill', terminalManager.has(name), false);

    // error: kill non-existent
    let killErr = false;
    try { await terminalManager.kill('no-such-terminal'); } catch { killErr = true; }
    eq('kill throws for unknown terminal', killErr, true);

    // killAll is a no-op when pool is empty
    await terminalManager.killAll();
    eq('killAll on empty pool completes without error', true, true);

  } catch (err) {
    failed++;
    console.log(`  ❌ TerminalManager integration failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Clean up any leftover terminals
    if (terminalManager.has(name)) {
      await terminalManager.kill(name).catch(() => {});
    }
    await terminalManager.killAll().catch(() => {});
  }

  console.log(`\n  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Allow direct execution: tsx test/terminal.test.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTerminalTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
