/**
 * Web Search Tool — Unit Tests
 * Tests the Zod schema validation and definition shape without API calls.
 */

import { pathToFileURL } from 'node:url';
import { definition } from '../src/tools/webSearch.js';
import { z } from 'zod';

interface SimpleCase {
  description: string;
  fn: () => boolean;
}

function runSuite(name: string, cases: SimpleCase[]): { passed: number; failed: number } {
  console.log(`\n📋 ${name}`);
  console.log('━'.repeat(70));
  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    try {
      const ok = c.fn();
      if (ok) {
        passed++;
        console.log(`  ✅ web_search        → ${c.description}`);
      } else {
        failed++;
        console.error(`  ❌ web_search        → ${c.description}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ❌ web_search        → ${c.description} (threw: ${err instanceof Error ? err.message : err})`);
    }
  }
  console.log('━'.repeat(70));
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${cases.length} tests`);
  return { passed, failed };
}

// ── definition shape tests ────────────────────────────────────────────────────

const definitionCases: SimpleCase[] = [
  { description: 'name is web_search',              fn: () => definition.name === 'web_search' },
  { description: 'has a description string',        fn: () => typeof definition.description === 'string' && definition.description.length > 0 },
  { description: 'parameters has query property',   fn: () => 'query' in definition.parameters.properties },
  { description: 'query is required',               fn: () => definition.parameters.required.includes('query') },
  { description: 'schema is defined',               fn: () => definition.schema !== undefined },
];

// ── schema validation tests ───────────────────────────────────────────────────

const schema = definition.schema as z.ZodObject<{ query: z.ZodString }>;

const schemaCases: SimpleCase[] = [
  {
    description: 'accepts a valid query string',
    fn: () => schema.safeParse({ query: 'latest news' }).success,
  },
  {
    description: 'rejects empty query string',
    fn: () => !schema.safeParse({ query: '' }).success,
  },
  {
    description: 'rejects missing query field',
    fn: () => !schema.safeParse({}).success,
  },
  {
    description: 'rejects non-string query',
    fn: () => !schema.safeParse({ query: 123 }).success,
  },
  {
    description: 'accepts multi-word query',
    fn: () => schema.safeParse({ query: 'Elon Musk Tesla Roadster latest news' }).success,
  },
  {
    description: 'accepts query with special characters',
    fn: () => schema.safeParse({ query: 'what is 2+2? site:math.com' }).success,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runWebSearchTests(): Promise<{ passed: number; failed: number }> {
  const d = runSuite('definition shape', definitionCases);
  const s = runSuite('schema validation', schemaCases);
  return {
    passed: d.passed + s.passed,
    failed: d.failed + s.failed,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWebSearchTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
