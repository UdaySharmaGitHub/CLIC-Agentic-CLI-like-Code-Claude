/**
 * /ping health-check command tests.
 * Verifies success and error paths for runPing() without touching a real API.
 * Run with: pnpm test:ping
 */
import { pathToFileURL } from 'node:url';
import { runPing } from '../src/commands/ping.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

/** Minimal mock client — no real OpenAI SDK imported. */
function mockClient(behavior: 'ok' | { status: number; message: string } | Error): any {
  return {
    chat: {
      completions: {
        create: async () => {
          if (behavior === 'ok')
            return { choices: [{ message: { content: 'OK' } }] };
          throw behavior;
        },
      },
    },
  };
}

export async function runPingTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\n/ping Health-Check Command Tests');

  // 1. Success path
  {
    const result = await runPing(mockClient('ok'), 'gpt-4o');
    eq(
      'success: starts with ✅',
      result.startsWith('✅'),
      true,
    );
    eq(
      'success: contains "latency:"',
      result.includes('latency:'),
      true,
    );
    eq(
      'success: contains "ms"',
      result.includes('ms'),
      true,
    );
  }

  // 2. Auth failure (401)
  {
    const result = await runPing(mockClient({ status: 401, message: 'Unauthorized' }), 'gpt-4o');
    eq(
      '401: starts with ❌',
      result.startsWith('❌'),
      true,
    );
    eq(
      '401: contains "API_KEY"',
      result.includes('API_KEY'),
      true,
    );
  }

  // 3. Not found (404)
  {
    const result = await runPing(mockClient({ status: 404, message: 'Not Found' }), 'gpt-4o');
    eq(
      '404: starts with ❌',
      result.startsWith('❌'),
      true,
    );
    eq(
      '404: contains "BASE_URL"',
      result.includes('BASE_URL'),
      true,
    );
  }

  // 4. Network error (no status)
  {
    const result = await runPing(mockClient(new Error('ECONNREFUSED')), 'gpt-4o');
    eq(
      'network error: starts with ❌',
      result.startsWith('❌'),
      true,
    );
    eq(
      'network error: contains "BASE_URL"',
      result.includes('BASE_URL'),
      true,
    );
  }

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Allow direct execution: tsx test/ping.test.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPingTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
