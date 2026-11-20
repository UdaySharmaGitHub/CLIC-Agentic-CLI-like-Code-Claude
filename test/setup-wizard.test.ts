/**
 * Setup Wizard — credential persistence tests.
 *
 * Verifies saveCredentials() and globalEnvFile() behaviour:
 *   - globalEnvFile() resolves under clicHome()
 *   - saveCredentials() creates directory + file when absent
 *   - saveCredentials() writes KEY=value lines for each credential
 *   - saveCredentials() skips keys already present in the target file
 *   - saveCredentials() appends new keys without disturbing existing content
 *   - saveCredentials() is a no-op when all credentials already present
 *   - CLIC_HOME override is honoured
 *
 * Uses isolated temp dirs; never touches the real ~/.clic.
 * Run with: pnpm test:setup-wizard
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveCredentials, globalEnvFile, clicHome } from '../src/config.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const isOk = JSON.stringify(actual) === JSON.stringify(expected);
  if (isOk) { passed++; console.log(`  ✅ ${desc}`); }
  else {
    failed++;
    console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`);
  }
}

function ok(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}`); }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function runSetupWizardTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nSetup Wizard Tests');

  const savedClicHome = process.env.CLIC_HOME;
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'clic-setup-wizard-test-'));

  try {

    // ── globalEnvFile() ────────────────────────────────────────────────────────

    console.log('\n  globalEnvFile()');
    {
      process.env.CLIC_HOME = path.join(tmpBase, 'home1');
      const result = globalEnvFile();
      eq('resolves to <clicHome>/.env', result, path.join(process.env.CLIC_HOME, '.env'));
    }

    {
      delete process.env.CLIC_HOME;
      const result = globalEnvFile();
      eq('defaults to ~/.clic/.env when CLIC_HOME unset', result, path.join(os.homedir(), '.clic', '.env'));
    }

    // ── saveCredentials() — fresh file ────────────────────────────────────────

    console.log('\n  saveCredentials() — fresh directory and file');
    {
      const home = path.join(tmpBase, 'home2');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      ok('target dir does not exist before save', !(await exists(path.dirname(target))));

      await saveCredentials({ API_KEY: 'sk-test-123', BASE_URL: 'https://api.example.com' }, target);

      ok('creates ~/.clic/ directory', await exists(path.dirname(target)));
      ok('creates .env file', await exists(target));

      const content = await fs.readFile(target, 'utf-8');
      ok('writes API_KEY line', content.includes('API_KEY=sk-test-123'));
      ok('writes BASE_URL line', content.includes('BASE_URL=https://api.example.com'));
      ok('file ends with newline', content.endsWith('\n'));
    }

    // ── saveCredentials() — skip existing keys ────────────────────────────────

    console.log('\n  saveCredentials() — existing file, skip duplicate keys');
    {
      const home = path.join(tmpBase, 'home3');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'API_KEY=old-key\n', 'utf-8');

      await saveCredentials({ API_KEY: 'new-key', BASE_URL: 'https://api.example.com' }, target);

      const content = await fs.readFile(target, 'utf-8');
      ok('does not overwrite existing API_KEY', content.includes('API_KEY=old-key'));
      ok('appends missing BASE_URL', content.includes('BASE_URL=https://api.example.com'));
      ok('does not contain new-key', !content.includes('new-key'));
    }

    // ── saveCredentials() — append to existing content ────────────────────────

    console.log('\n  saveCredentials() — append preserves prior content');
    {
      const home = path.join(tmpBase, 'home4');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      await fs.mkdir(path.dirname(target), { recursive: true });
      const prior = '# My custom config\nEXISTING_KEY=abc\n';
      await fs.writeFile(target, prior, 'utf-8');

      await saveCredentials({ API_KEY: 'sk-new' }, target);

      const content = await fs.readFile(target, 'utf-8');
      ok('preserves comment line', content.includes('# My custom config'));
      ok('preserves EXISTING_KEY', content.includes('EXISTING_KEY=abc'));
      ok('appends API_KEY', content.includes('API_KEY=sk-new'));
    }

    // ── saveCredentials() — file missing trailing newline ─────────────────────

    console.log('\n  saveCredentials() — file without trailing newline');
    {
      const home = path.join(tmpBase, 'home5');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      await fs.mkdir(path.dirname(target), { recursive: true });
      // Deliberately no trailing newline
      await fs.writeFile(target, 'EXISTING=1', 'utf-8');

      await saveCredentials({ API_KEY: 'sk-new' }, target);

      const content = await fs.readFile(target, 'utf-8');
      // Should have a newline between EXISTING=1 and API_KEY=sk-new
      ok('appended key is on its own line', content.includes('\nAPI_KEY=sk-new'));
    }

    // ── saveCredentials() — all keys already present (no-op) ─────────────────

    console.log('\n  saveCredentials() — no-op when all keys already present');
    {
      const home = path.join(tmpBase, 'home6');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      const original = 'API_KEY=existing\nBASE_URL=https://existing.com\n';
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, original, 'utf-8');

      await saveCredentials({ API_KEY: 'new', BASE_URL: 'https://new.com' }, target);

      const content = await fs.readFile(target, 'utf-8');
      eq('file unchanged', content, original);
    }

    // ── saveCredentials() — empty credentials (no-op) ─────────────────────────

    console.log('\n  saveCredentials() — empty credentials object');
    {
      const home = path.join(tmpBase, 'home7');
      process.env.CLIC_HOME = home;
      const target = globalEnvFile();

      // File does not exist; calling with {} should not create it
      await saveCredentials({}, target);

      ok('does not create file for empty credentials', !(await exists(target)));
    }

    // ── CLIC_HOME isolation ───────────────────────────────────────────────────

    console.log('\n  CLIC_HOME isolation');
    {
      const home = path.join(tmpBase, 'home8');
      process.env.CLIC_HOME = home;
      ok('globalEnvFile honours CLIC_HOME', globalEnvFile() === path.join(home, '.env'));
    }

  } finally {
    // Restore env
    if (savedClicHome !== undefined) {
      process.env.CLIC_HOME = savedClicHome;
    } else {
      delete process.env.CLIC_HOME;
    }
    // Cleanup temp dir
    try { await fs.rm(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const status = failed === 0 ? '✅' : '❌';
  console.log(`\n  ${status} Setup Wizard Tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Run standalone when invoked directly
const isMain = process.argv[1]?.endsWith('setup-wizard.test.ts') ||
               process.argv[1]?.endsWith('setup-wizard.test.js');
if (isMain) {
  runSetupWizardTests().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}
