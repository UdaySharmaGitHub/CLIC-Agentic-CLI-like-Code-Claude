// Phase 2 smoke test — run_command now uses the persistent terminal
import { execute, schema } from '../src/tools/runCommand.js';

const autoConfirm = async () => true;
let p = 0, f = 0;
const ok   = (l: string) => { console.log(`  ✅  ${l}`); p++; };
const fail = (l: string, d?: string) => { console.log(`  ❌  ${l}${d ? ` — ${d}` : ''}`); f++; };

// 1: basic command
const r1 = await execute({ command: 'echo "run_command_works"' }, autoConfirm);
if (!r1.isError && r1.output.includes('run_command_works')) ok('basic echo via persistent terminal');
else fail('basic echo', r1.output.slice(0, 120));

// 2: persistent cwd — cd in one call, pwd in the next
await execute({ command: 'cd /tmp' }, autoConfirm);
const r2 = await execute({ command: 'pwd' }, autoConfirm);
if (r2.output.includes('/tmp')) ok('persistent cwd across two run_command calls');
else fail('persistent cwd', r2.output.slice(0, 120));

// 3: named terminal param
const r3 = await execute({ command: 'echo "on_worker"', terminal: 'worker' }, autoConfirm);
if (!r3.isError && r3.output.includes('on_worker')) ok('optional terminal param routes to named terminal');
else fail('named terminal', r3.output.slice(0, 120));

// 4: safety gate still blocks dangerous commands
const r4 = await execute({ command: 'rm -rf /' }, autoConfirm);
if (r4.isError && r4.output.includes('blocked')) ok('safety gate still blocks rm -rf /');
else fail('safety gate', r4.output.slice(0, 120));

// 5: schema rejects empty command
const parsed = schema.safeParse({ command: '' });
if (!parsed.success) ok('Zod rejects empty command');
else fail('Zod empty command');

// 6: terminal param is optional in schema
const parsed2 = schema.safeParse({ command: 'echo hi' });
if (parsed2.success && parsed2.data.terminal === undefined) ok('terminal param optional in schema');
else fail('terminal optional', JSON.stringify(parsed2));

import { terminalManager } from '../src/terminal.js';
await terminalManager.killAll();

console.log(`\n  ──────────────────────────────────────`);
console.log(`  Phase 2: ${p} passed, ${f} failed`);
if (f === 0) console.log('  ✅  run_command rewire complete — Phase 2 DONE.');
process.exit(f > 0 ? 1 : 0);
