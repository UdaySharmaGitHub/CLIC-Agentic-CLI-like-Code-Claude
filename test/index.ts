/**
 * Main Test Runner — Zod Tool Input Validation
 *
 * This is the central entry point for all Zod validation tests.
 * It imports and runs all test suites, aggregates results, and displays a summary.
 *
 * Run with: pnpm test:zod
 */

import { runValidationGateTests } from './zod-validation.test.js';
import { runToolSchemaTests } from './tool-schemas.test.js';
import { runEdgeCaseTests } from './edge-cases.test.js';
import { runWatcherTests } from './watcher.test.js';

/**
 * Banner for test output
 */
function printBanner() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║         ✨ ZOD TOOL INPUT VALIDATION — Test Suite                         ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Print summary footer
 */
function printSummary(
  validationGate: { passed: number; failed: number },
  toolSchemas: { passed: number; failed: number },
  edgeCases: { passed: number; failed: number },
  watcher: { passed: number; failed: number },
) {
  const totalPassed = validationGate.passed + toolSchemas.passed + edgeCases.passed + watcher.passed;
  const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed;
  const totalTests = totalPassed + totalFailed;

  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                          TEST SUITE SUMMARY                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Validation Gate Tests        : ${validationGate.passed.toString().padEnd(2)} passed, ${validationGate.failed.toString().padEnd(2)} failed                ║
║  Tool Schema Tests            : ${toolSchemas.passed.toString().padEnd(2)} passed, ${toolSchemas.failed.toString().padEnd(2)} failed                ║
║  Edge Case Tests              : ${edgeCases.passed.toString().padEnd(2)} passed, ${edgeCases.failed.toString().padEnd(2)} failed                ║
║  Watcher Pure-Helper Tests    : ${watcher.passed.toString().padEnd(2)} passed, ${watcher.failed.toString().padEnd(2)} failed                ║
║                                                                            ║
║  ─────────────────────────────────────────────────────────────────────   ║
║  TOTAL                        : ${totalPassed.toString().padEnd(2)} passed, ${totalFailed.toString().padEnd(2)} failed (${totalTests} tests)           ║
║                                                                            ║`);

  if (totalFailed === 0) {
    console.log(`║  ✅ ALL TESTS PASSED — Zod validation is working perfectly!    ║`);
  } else {
    console.log(`║  ⚠️  ${totalFailed} test(s) failed — see details above                       ║`);
  }

  console.log(`║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Main test runner
 */
async function runAllTests() {
  printBanner();

  console.log('Running test suites...\n');

  try {
    // Run each test suite
    const validationGate = await runValidationGateTests();
    const toolSchemas = await runToolSchemaTests();
    const edgeCases = await runEdgeCaseTests();
    const watcher = await runWatcherTests();

    // Print summary
    printSummary(validationGate, toolSchemas, edgeCases, watcher);

    // Exit with appropriate code
    const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed;
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  }
}

// Run tests
runAllTests();
