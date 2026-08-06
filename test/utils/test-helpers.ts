/**
 * Test Helpers — Shared utilities for all Zod validation tests
 */

import { getToolDefinitions } from '../../src/tools/index.js';
import type { ToolResult } from '../../src/tools/types.js';

/**
 * Test case definition
 */
export interface TestCase {
  description: string;
  toolName: string;
  input: Record<string, unknown>;
  shouldValidate: boolean;
  expectedErrorPattern?: string;
}

/**
 * Validate input against a tool's schema (without executing the tool)
 * Returns true if validation passed, false if it failed
 */
export function validateToolSchema(
  toolName: string,
  input: Record<string, unknown>,
): { isValid: boolean; errorMessage?: string } {
  try {
    const toolDef = getToolDefinitions().find(t => t.name === toolName);
    if (!toolDef) {
      return { isValid: false, errorMessage: `Tool not found: ${toolName}` };
    }

    const parsed = (toolDef as any).schema.safeParse(input);
    if (!parsed.success) {
      return {
        isValid: false,
        errorMessage: parsed.error.message,
      };
    }

    return { isValid: true };
  } catch (err) {
    return {
      isValid: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run a single test case and return whether it passed
 */
export async function runTestCase(testCase: TestCase): Promise<boolean> {
  try {
    const { isValid, errorMessage } = validateToolSchema(testCase.toolName, testCase.input);
    const ok = isValid === testCase.shouldValidate;

    if (!ok) {
      const expected = testCase.shouldValidate ? 'VALID' : 'INVALID';
      const actual = isValid ? 'VALID' : 'INVALID';
      console.error(
        `  ❌ ${testCase.toolName.padEnd(15)} → ${testCase.description}`,
      );
      console.error(`     Expected: ${expected}, Got: ${actual}`);
      if (errorMessage) {
        console.error(`     Error: ${errorMessage.split('\n')[0].slice(0, 80)}`);
      }
      return false;
    }

    return true;
  } catch (err) {
    console.error(
      `  ❌ ${testCase.toolName.padEnd(15)} → ${testCase.description} (threw error)`,
    );
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Run all test cases and return summary
 */
export async function runTestSuite(
  suiteName: string,
  testCases: TestCase[],
): Promise<{ passed: number; failed: number }> {
  console.log(`\n📋 ${suiteName}`);
  console.log('━'.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTestCase(testCase);
    if (result) {
      passed++;
      const icon = testCase.shouldValidate ? '✅' : '🚫';
      console.log(
        `  ${icon} ${testCase.toolName.padEnd(15)} → ${testCase.description}`,
      );
    } else {
      failed++;
    }
  }

  console.log('━'.repeat(70));
  console.log(
    `  Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`,
  );

  return { passed, failed };
}

/**
 * Format output for display
 */
export function formatOutput(output: string, maxLen: number = 80): string {
  return output.split('\n')[0].slice(0, maxLen);
}

