// Phase 3 smoke test — terminal tool actions
import { execute, schema } from '../src/tools/terminal.js';
import { terminalManager } from '../src/terminal.js';

const yes = async () => true;
let p = 0, f = 0;
const ok   = (l: string) => { console.log(`  ✅  ${l}`); p++; };
const fail = (l: string, d?: string) => { console.log(`  ❌  ${l}${d ? ` — ${d}` : ''}`); f++; };

// 1: create
const r1 = await execute({ action: 'create', name: 'test-term' }, yes);
if (!r1.isError && r1.output.includes('test-term')) ok('create spawns terminal');
else fail('create', r1.output.slice(0, 100));

// 2: list
const r2 = await execute({ action: 'list' }, yes);
if (!r2.isError && r2.output.includes('test-term')) ok('list shows new terminal');
else fail('list', r2.output.slice(0, 100));

// 3: start background + read
const r3 = await execute({ action: 'start', name: 'test-term', command: 'for i in 1 2 3; do echo "bg_$i"; sleep 0.1; done' }, yes);
if (!r3.isError) ok('start background process');
else fail('start', r3.output.slice(0, 100));

await new Promise(r => setTimeout(r, 500));

const r4 = await execute({ action: 'read', name: 'test-term', lines: 20 }, yes);
if (!r4.isError) ok('read returns buffered output');
else fail('read', r4.output.slice(0, 100));

// 4: write stdin
const r5 = await execute({ action: 'write', name: 'test-term', input: 'echo "wrote_to_stdin"\n' }, yes);
if (!r5.isError) ok('write sends stdin');
else fail('write', r5.output.slice(0, 100));

// 5: kill
const r6 = await execute({ action: 'kill', name: 'test-term' }, yes);
if (!r6.isError && !terminalManager.has('test-term')) ok('kill removes terminal');
else fail('kill', r6.output.slice(0, 100));

// 6: list now empty
const r7 = await execute({ action: 'list' }, yes);
if (!r7.isError && !r7.output.includes('test-term')) ok('list empty after kill');
else fail('list after kill', r7.output.slice(0, 100));

// 7: Zod rejects unknown action
const z1 = schema.safeParse({ action: 'nope' });
if (!z1.success) ok('Zod rejects unknown action');
else fail('Zod unknown action');

// 8: Zod rejects write without input
const z2 = schema.safeParse({ action: 'write', name: 'main' });
if (!z2.success) ok('Zod rejects write missing input');
else fail('Zod write missing input');

// 9: safety gate blocks dangerous start
const r8 = await execute({ action: 'start', name: 'main', command: 'rm -rf /' }, yes);
if (r8.isError && r8.output.includes('blocked')) ok('safety gate blocks dangerous start');
else fail('safety gate', r8.output.slice(0, 100));

await terminalManager.killAll();

console.log(`\n  ──────────────────────────────────────`);
console.log(`  Phase 3: ${p} passed, ${f} failed`);
if (f === 0) console.log('  ✅  terminal tool complete — Phase 3 DONE.');
process.exit(f > 0 ? 1 : 0);
