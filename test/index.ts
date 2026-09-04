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
import { runPrivacyTests } from './privacy.test.js';
import { runExportTests } from './export.test.js';
import { runTerminalTests } from './terminal.test.js';

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
  privacy: { passed: number; failed: number },
  exportResult: { passed: number; failed: number },
  terminal: { passed: number; failed: number },
) {
  const totalPassed = validationGate.passed + toolSchemas.passed + edgeCases.passed + watcher.passed + privacy.passed + exportResult.passed + terminal.passed;
  const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed + privacy.failed + exportResult.failed + terminal.failed;
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
║  Privacy / No-History Tests   : ${privacy.passed.toString().padEnd(2)} passed, ${privacy.failed.toString().padEnd(2)} failed                ║
║  Export Command Tests         : ${exportResult.passed.toString().padEnd(2)} passed, ${exportResult.failed.toString().padEnd(2)} failed                ║
║  Terminal Module Tests        : ${terminal.passed.toString().padEnd(2)} passed, ${terminal.failed.toString().padEnd(2)} failed                ║
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
    const privacy = await runPrivacyTests();
    const exportResult = await runExportTests();
    const terminal = await runTerminalTests();

    // Print summary
    printSummary(validationGate, toolSchemas, edgeCases, watcher, privacy, exportResult, terminal);

    // Exit with appropriate code
    const totalFailed = validationGate.failed + toolSchemas.failed + edgeCases.failed + watcher.failed + privacy.failed + exportResult.failed + terminal.failed;
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  }
}

// Run tests
runAllTests();
