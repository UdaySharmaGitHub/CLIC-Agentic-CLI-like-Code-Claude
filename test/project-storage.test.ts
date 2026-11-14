/**
 * Project-Scoped Global Storage tests.
 *
 * Verifies CLIC scopes its state per project under a global root (~/.clic/),
 * keyed by the canonical project path. Covers:
 *   - projectDirName()  — stability, collision guarantee, sanitization, length cap
 *   - projectRoot()     — honors CLIC_HOME
 *   - path resolvers    — honor AGENT_* overrides, else sit under projectRoot()
 *   - sessionHistoryPath() composes under sessionsDir()
 *   - migrateProjectState() — one-time copy, idempotent, ephemeral no-op
 *   - credential precedence — shell env > ./.env > ~/.clic/.env
 *
 * Uses isolated temp dirs + CLIC_HOME; never touches the real ~/.clic or repo state.
 * Run with: pnpm test:project-storage
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execa } from 'execa';
import {
  clicHome,
  projectDirName,
  projectRoot,
  historyFile,
  tokenGraphFile,
  sessionsDir,
  sessionsIndexFile,
  sessionHistoryPath,
} from '../src/config.js';
import { migrateProjectState } from '../src/session.js';
import { setEphemeral } from '../src/privacy.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const isOk = JSON.stringify(actual) === JSON.stringify(expected);
  if (isOk) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

function ok(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}`); }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_TS = path.join(HERE, '..', 'src', 'config.ts');

export async function runProjectStorageTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nProject-Scoped Global Storage Tests');

  // Snapshot env we mutate, restore in finally.
  const saved = {
    CLIC_HOME: process.env.CLIC_HOME,
    AGENT_HISTORY_FILE: process.env.AGENT_HISTORY_FILE,
    AGENT_TOKEN_GRAPH_FILE: process.env.AGENT_TOKEN_GRAPH_FILE,
    AGENT_SESSIONS_DIR: process.env.AGENT_SESSIONS_DIR,
    AGENT_SESSIONS_INDEX_FILE: process.env.AGENT_SESSIONS_INDEX_FILE,
  };
  function clearAgentOverrides() {
    delete process.env.AGENT_HISTORY_FILE;
    delete process.env.AGENT_TOKEN_GRAPH_FILE;
    delete process.env.AGENT_SESSIONS_DIR;
    delete process.env.AGENT_SESSIONS_INDEX_FILE;
  }

  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'clic-pstore-'));

  try {
    // ── projectDirName: stable for same canonical path ──
    clearAgentOverrides();
    const appA = path.join(tmpBase, 'locA', 'my-app');
    const appB = path.join(tmpBase, 'locB', 'my-app');
    await fs.mkdir(appA, { recursive: true });
    await fs.mkdir(appB, { recursive: true });
    eq('projectDirName stable for same canonical path',
       projectDirName(appA), projectDirName(appA));

    // ── projectDirName: collision guarantee (same basename, different path) ──
    ok('same-basename dirs map to different project dirs',
       projectDirName(appA) !== projectDirName(appB));
    ok('both keep the readable basename prefix',
       projectDirName(appA).startsWith('my-app-') && projectDirName(appB).startsWith('my-app-'));

    // ── projectDirName: shape is <sanitized>-<hash8> ──
    ok('project dir name matches <name>-<hash8> shape',
       /^[A-Za-z0-9_-]+-[0-9a-f]{8}$/.test(projectDirName(appA)));

    // ── projectDirName: sanitizes spaces/unicode ──
    const weird = path.join(tmpBase, 'weird name (ünïcode)!');
    await fs.mkdir(weird, { recursive: true });
    ok('sanitizes non [A-Za-z0-9_-] chars in basename',
       /^[A-Za-z0-9_-]+-[0-9a-f]{8}$/.test(projectDirName(weird)));

    // ── projectDirName: caps basename length ──
    const longName = 'x'.repeat(120);
    const longDir = path.join(tmpBase, longName);
    await fs.mkdir(longDir, { recursive: true });
    const longOut = projectDirName(longDir);
    const prefix = longOut.slice(0, longOut.lastIndexOf('-'));
    ok('caps the readable prefix at <= 40 chars', prefix.length <= 40);

    // ── clicHome / projectRoot honor CLIC_HOME ──
    const home = path.join(tmpBase, 'home');
    process.env.CLIC_HOME = home;
    eq('clicHome honors CLIC_HOME', clicHome(), home);
    ok('projectRoot sits under CLIC_HOME/projects',
       projectRoot(appA) === path.join(home, 'projects', projectDirName(appA)));

    // ── path resolvers under projectRoot when no AGENT_* override ──
    clearAgentOverrides();
    process.env.CLIC_HOME = home;
    eq('historyFile under projectRoot',
       historyFile(), path.join(projectRoot(), 'chat_history.json'));
    eq('tokenGraphFile under projectRoot',
       tokenGraphFile(), path.join(projectRoot(), 'token_graph.json'));
    eq('sessionsDir under projectRoot',
       sessionsDir(), path.join(projectRoot(), 'sessions'));
    eq('sessionsIndexFile under projectRoot',
       sessionsIndexFile(), path.join(projectRoot(), 'sessions.json'));

    // ── AGENT_* overrides win verbatim ──
    process.env.AGENT_HISTORY_FILE = '/fixtures/hist.json';
    process.env.AGENT_TOKEN_GRAPH_FILE = '/fixtures/graph.json';
    process.env.AGENT_SESSIONS_DIR = '/fixtures/sessions';
    process.env.AGENT_SESSIONS_INDEX_FILE = '/fixtures/sessions.json';
    eq('historyFile honors AGENT_HISTORY_FILE', historyFile(), '/fixtures/hist.json');
    eq('tokenGraphFile honors AGENT_TOKEN_GRAPH_FILE', tokenGraphFile(), '/fixtures/graph.json');
    eq('sessionsDir honors AGENT_SESSIONS_DIR', sessionsDir(), '/fixtures/sessions');
    eq('sessionsIndexFile honors AGENT_SESSIONS_INDEX_FILE', sessionsIndexFile(), '/fixtures/sessions.json');

    // ── sessionHistoryPath composes under sessionsDir ──
    eq('sessionHistoryPath composes under sessionsDir',
       sessionHistoryPath('work'), path.join(sessionsDir(), 'work', 'chat_history.json'));
    clearAgentOverrides();

    // ── Migration: first run copies legacy CWD files into a fresh project root ──
    setEphemeral(false);
    process.env.CLIC_HOME = home;
    const cwd1 = path.join(tmpBase, 'legacyProj');
    await fs.mkdir(path.join(cwd1, 'sessions', 'default'), { recursive: true });
    await fs.writeFile(path.join(cwd1, 'chat_history.json'), '[]', 'utf-8');
    await fs.writeFile(path.join(cwd1, 'token_graph.json'), '{}', 'utf-8');
    await fs.writeFile(path.join(cwd1, 'sessions.json'), '{"active":"default","sessions":[]}', 'utf-8');
    await fs.writeFile(path.join(cwd1, 'sessions', 'default', 'chat_history.json'), '[]', 'utf-8');

    await migrateProjectState(cwd1);
    const root1 = projectRoot(cwd1);
    ok('migration copied chat_history.json into project root',
       await exists(path.join(root1, 'chat_history.json')));
    ok('migration copied token_graph.json into project root',
       await exists(path.join(root1, 'token_graph.json')));
    ok('migration copied sessions.json into project root',
       await exists(path.join(root1, 'sessions.json')));
    ok('migration copied sessions/ dir into project root',
       await exists(path.join(root1, 'sessions', 'default', 'chat_history.json')));
    ok('originals remain in CWD (lossless copy)',
       await exists(path.join(cwd1, 'chat_history.json')));

    // ── Migration: second run is a no-op (does not overwrite) ──
    await fs.writeFile(path.join(root1, 'chat_history.json'), 'SENTINEL', 'utf-8');
    await migrateProjectState(cwd1);
    eq('second migration does not overwrite existing root files',
       await fs.readFile(path.join(root1, 'chat_history.json'), 'utf-8'), 'SENTINEL');

    // ── Migration: ephemeral mode copies nothing ──
    const home2 = path.join(tmpBase, 'home2');
    process.env.CLIC_HOME = home2;
    const cwd2 = path.join(tmpBase, 'legacyProj2');
    await fs.mkdir(cwd2, { recursive: true });
    await fs.writeFile(path.join(cwd2, 'sessions.json'), '{}', 'utf-8');
    setEphemeral(true);
    await migrateProjectState(cwd2);
    ok('ephemeral migration writes nothing',
       !(await exists(projectRoot(cwd2))));
    setEphemeral(false);

    // ── Credential precedence: shell env > ./.env > ~/.clic/.env ──
    await runCredentialPrecedence(tmpBase);

  } finally {
    setEphemeral(false);
    // Restore env.
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await fs.rm(tmpBase, { recursive: true, force: true });
  }

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

/**
 * Spawns a child `tsx` that imports config.ts (triggering the ordered dotenv load)
 * and prints CLIC_TEST_CRED, under controlled cwd / CLIC_HOME / shell env.
 */
async function runCredentialPrecedence(tmpBase: string): Promise<void> {
  const proj = path.join(tmpBase, 'credProj');
  const gHome = path.join(tmpBase, 'credHome');
  await fs.mkdir(proj, { recursive: true });
  await fs.mkdir(gHome, { recursive: true });
  await fs.writeFile(path.join(proj, '.env'), 'CLIC_TEST_CRED=project\n', 'utf-8');
  await fs.writeFile(path.join(gHome, '.env'), 'CLIC_TEST_CRED=global\n', 'utf-8');

  const probe = path.join(tmpBase, 'probe.mjs');
  await fs.writeFile(
    probe,
    `await import(${JSON.stringify(pathToFileURL(CONFIG_TS).href)});\n` +
    `process.stdout.write(process.env.CLIC_TEST_CRED ?? '');\n`,
    'utf-8',
  );

  const tsxBin = path.join(HERE, '..', 'node_modules', '.bin', 'tsx');

  async function probeValue(env: Record<string, string | undefined>): Promise<string> {
    const res = await execa(tsxBin, [probe], {
      cwd: proj,
      env: { ...process.env, CLIC_HOME: gHome, CLIC_TEST_CRED: undefined, ...env },
      extendEnv: false,
      reject: false,
    });
    return res.stdout.trim();
  }

  // project .env present → project beats global fallback
  eq('project .env beats ~/.clic/.env', await probeValue({}), 'project');

  // shell env set → beats both .env files
  eq('shell env beats project and global .env',
     await probeValue({ CLIC_TEST_CRED: 'shell' }), 'shell');

  // no project .env → global fallback is used
  await fs.rm(path.join(proj, '.env'), { force: true });
  eq('~/.clic/.env used when no project .env', await probeValue({}), 'global');
}

// Allow direct execution: tsx test/project-storage.test.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProjectStorageTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
