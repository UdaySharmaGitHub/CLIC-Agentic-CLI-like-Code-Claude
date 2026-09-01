// Phase 1 integration test — run with: npx tsx scripts/terminal-integration-test.ts
import { terminalManager } from '../src/terminal.js';

let p = 0, f = 0;
const ok   = (l: string) => { console.log(`  ✅  ${l}`); p++; };
const fail = (l: string, d?: string) => { console.log(`  ❌  ${l}${d ? ` — ${d}` : ''}`); f++; };

// 1: auto-spawn on first exec
const r1 = await terminalManager.exec('main', 'echo "hello_clic"');
if (r1.output.includes('hello_clic') && r1.exitCode === 0) ok('auto-spawn + basic echo');
else fail('auto-spawn + basic echo', JSON.stringify(r1));

// 2: persistent cwd
await terminalManager.exec('main', 'cd /tmp');
const r2 = await terminalManager.exec('main', 'pwd');
if (r2.output.includes('/tmp')) ok('persistent cwd');
else fail('persistent cwd', r2.output);

// 3: persistent env
await terminalManager.exec('main', 'export CLIC_TEST=hello123');
const r3 = await terminalManager.exec('main', 'echo $CLIC_TEST');
if (r3.output.includes('hello123')) ok('persistent env');
else fail('persistent env', r3.output);

// 4: non-zero exit code
const r4 = await terminalManager.exec('main', 'false');
if (r4.exitCode === 1) ok('non-zero exit code');
else fail('non-zero exit code', String(r4.exitCode));

// 5: list()
const list = terminalManager.list();
if (list.length === 1 && list[0].name === 'main' && list[0].status === 'idle')
  ok('list() shows main:idle');
else fail('list()', JSON.stringify(list));

// 6: second terminal + parallel (pre-spawn worker so startup cost doesn't skew timing)
await terminalManager.spawn('worker');
const t2Start = Date.now();
const [r5, r6] = await Promise.all([
  terminalManager.exec('main',   'sleep 0.4 && echo "t1"'),
  terminalManager.exec('worker', 'sleep 0.4 && echo "t2"'),
]);
const elapsed = Date.now() - t2Start;
if (r5.output.includes('t1') && r6.output.includes('t2') && elapsed < 1200)
  ok(`parallel exec across two terminals (${elapsed}ms < 1200ms)`);
else fail('parallel exec', `t1="${r5.output}" t2="${r6.output}" ${elapsed}ms`);

// 7: read() returns buffered output
const buf = terminalManager.read('main', 20);
if (typeof buf === 'string' && buf.length > 0) ok('read() returns buffered output');
else fail('read()', buf);

// 8: has()
if (terminalManager.has('main') && !terminalManager.has('nope')) ok('has()');
else fail('has()');

// 9: killAll cleans up
await terminalManager.killAll();
if (!terminalManager.has('main') && !terminalManager.has('worker')) ok('killAll() removes all terminals');
else fail('killAll()', JSON.stringify(terminalManager.list()));

console.log(`\n  ──────────────────────────────────────`);
console.log(`  Integration: ${p} passed, ${f} failed`);
if (f === 0) console.log('  ✅  TerminalManager fully operational — Phase 1 DONE.');
process.exit(f > 0 ? 1 : 0);
