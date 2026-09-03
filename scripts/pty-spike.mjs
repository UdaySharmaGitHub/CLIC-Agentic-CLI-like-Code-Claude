#!/usr/bin/env node
// Phase 0 spike — proves node-pty works end-to-end on this machine.
// Tests: ESM import, spawn, persistent cd, env export, sentinel detection, kill.

import pty from 'node-pty';
import os from 'os';
import crypto from 'crypto';

const SHELL = process.env.SHELL || 'bash';
let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅  ${label}`);
  passed++;
}
function fail(label, detail) {
  console.log(`  ❌  ${label}`);
  if (detail) console.log(`       ${detail}`);
  failed++;
}

// Full VT100/xterm strip: CSI, OSC, DCS, ST, SS2/SS3, and leftover bare ESC sequences
function stripAnsi(str) {
  return str
    // OSC sequences: ESC ] ... (ST = ESC \ or BEL \x07)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // CSI sequences: ESC [ ... letter
    .replace(/\x1B\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, '')
    // DCS sequences: ESC P ... ST
    .replace(/\x1B[P\\X^_][\s\S]*?(?:\x1B\\|\x07)/g, '')
    // Single-char ESC sequences (ESC + single byte 0x40–0x5F, e.g. ESC M, ESC =)
    .replace(/\x1B[\x40-\x5F]/g, '')
    // Any remaining bare ESC
    .replace(/\x1B/g, '')
    // Carriage returns
    .replace(/\r/g, '');
}

// ── Spawn a PTY ──────────────────────────────────────────────────────────────

const term = pty.spawn(SHELL, [], {
  name: 'xterm-color',
  cols: 220,
  rows: 30,
  cwd: os.homedir(),
  env: { ...process.env },
});

ok(`ESM import + pty.spawn() succeeded (pid=${term.pid}, shell=${SHELL})`);

// ── Sentinel exec helper ─────────────────────────────────────────────────────

function exec(term_, command, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const token = crypto.randomUUID().replace(/-/g, '');
    const sentinel = new RegExp(`__CLIC_END__${token}__(\\d+)__`);
    let buf = '';
    let timer;
    let done = false;

    const onData = (data) => {
      if (done) return;
      buf += data;
      const m = sentinel.exec(buf);
      if (!m) return;

      done = true;
      clearTimeout(timer);
      term_.removeListener('data', onData);

      // Strip all VT sequences, then split on real newlines
      const clean = stripAnsi(buf);
      const lines = clean.split('\n')
        .map(l => l.trim())
        .filter(l =>
          l.length > 0 &&
          !l.includes('__CLIC_END__') &&
          !l.startsWith('printf \'__CLIC_END__') &&
          // Filter echoed command (match first 15 chars of command)
          !l.startsWith(command.trimStart().slice(0, 15)) &&
          // Filter zsh prompt artefacts (%, ❯, →, ➜)
          !/^[%❯→➜>$#]\s/.test(l) && l !== '%' && l !== '$'
        );

      resolve({ output: lines.join('\n').trim(), exitCode: parseInt(m[1], 10) });
    };

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      term_.removeListener('data', onData);
      reject(new Error(`Timeout after ${timeoutMs}ms for: ${command}`));
    }, timeoutMs);

    term_.onData(onData);
    term_.write(`${command}\nprintf '__CLIC_END__${token}__%d__\\n' "$?"\n`);
  });
}

// Wait for shell to initialise + flush startup noise
await new Promise(r => setTimeout(r, 800));

// Flush startup output by doing a no-op first
await exec(term, 'true').catch(() => {});

// ── Test 1: Basic command + exit code ────────────────────────────────────────

try {
  const r = await exec(term, 'echo "hello_clic"');
  if (r.output.includes('hello_clic') && r.exitCode === 0) {
    ok(`Basic echo — output contains "hello_clic", exit code 0`);
  } else {
    fail(`Basic echo`, `output="${r.output}" exitCode=${r.exitCode}`);
  }
} catch (e) { fail('Basic echo', e.message); }

// ── Test 2: Non-zero exit code ───────────────────────────────────────────────

try {
  const r = await exec(term, 'false');
  if (r.exitCode === 1) {
    ok(`Non-zero exit code — "false" correctly returned exit 1`);
  } else {
    fail(`Non-zero exit code`, `expected 1 got ${r.exitCode}`);
  }
} catch (e) { fail('Non-zero exit code', e.message); }

// ── Test 3: Persistent cwd (cd survives across calls) ────────────────────────

try {
  await exec(term, 'cd /tmp');
  const r = await exec(term, 'pwd');
  if (r.output.includes('/tmp')) {
    ok(`Persistent cwd — cd /tmp persisted across two exec() calls`);
  } else {
    fail(`Persistent cwd`, `pwd returned: "${r.output}"`);
  }
} catch (e) { fail('Persistent cwd', e.message); }

// ── Test 4: Persistent env (export survives across calls) ────────────────────

try {
  await exec(term, 'export CLIC_SPIKE_VAR=hello123');
  const r = await exec(term, 'echo $CLIC_SPIKE_VAR');
  if (r.output.includes('hello123')) {
    ok(`Persistent env — exported var survived across two exec() calls`);
  } else {
    fail(`Persistent env`, `echo returned: "${r.output}"`);
  }
} catch (e) { fail('Persistent env', e.message); }

// ── Test 5: Multi-line output ────────────────────────────────────────────────

try {
  const r = await exec(term, 'printf "line1\\nline2\\nline3\\n"');
  const lines = r.output.split('\n').filter(l => /^line\d$/.test(l.trim()));
  if (lines.length === 3) {
    ok(`Multi-line output — 3 lines captured correctly`);
  } else {
    fail(`Multi-line output`, `got lines: ${JSON.stringify(lines)} full="${r.output}"`);
  }
} catch (e) { fail('Multi-line output', e.message); }

// ── Test 6: Parallel (two independent PTYs run concurrently) ─────────────────

try {
  const term2 = pty.spawn(SHELL, [], {
    name: 'xterm-color', cols: 220, rows: 30,
    cwd: os.homedir(), env: { ...process.env },
  });
  await new Promise(r => setTimeout(r, 800));
  await exec(term2, 'true').catch(() => {});  // flush startup

  const start = Date.now();
  const [r1, r2] = await Promise.all([
    exec(term, 'sleep 0.4 && echo "terminal1"'),
    exec(term2, 'sleep 0.4 && echo "terminal2"'),
  ]);
  const elapsed = Date.now() - start;
  term2.kill();

  if (r1.output.includes('terminal1') && r2.output.includes('terminal2') && elapsed < 1200) {
    ok(`Parallel PTYs — two terminals ran concurrently (elapsed ${elapsed}ms < 1200ms)`);
  } else {
    fail(`Parallel PTYs`, `t1="${r1.output}" t2="${r2.output}" elapsed=${elapsed}ms`);
  }
} catch (e) { fail('Parallel PTYs', e.message); }

// ── Test 7: kill() disposes cleanly ──────────────────────────────────────────

try {
  const exitP = new Promise(resolve => term.onExit(({ exitCode }) => resolve(exitCode)));
  term.kill();
  const code = await Promise.race([
    exitP,
    new Promise((_, r) => setTimeout(() => r(new Error('kill timeout')), 3000)),
  ]);
  ok(`kill() — PTY disposed cleanly (exit event fired, code=${code})`);
} catch (e) { fail('kill()', e.message); }

// ── Summary ───────────────────────────────────────────────────────────────────

console.log();
console.log(`  ────────────────────────────────────────`);
console.log(`  Phase 0 spike: ${passed} passed, ${failed} failed`);
console.log(`  ────────────────────────────────────────`);
if (failed === 0) {
  console.log('  ✅  node-pty is fully operational — Phase 1 is a GO.');
} else {
  console.log('  ❌  Some tests failed — review before proceeding.');
}
process.exit(failed > 0 ? 1 : 0);
