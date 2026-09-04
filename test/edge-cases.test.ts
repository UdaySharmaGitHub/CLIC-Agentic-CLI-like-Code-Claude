/**
 * Edge Case Tests
 * Tests boundary conditions, type coercion, optional fields, and error handling
 * Schema-only validation (no tool execution)
 */

import { pathToFileURL } from 'node:url';
import { TestCase, runTestSuite } from './utils/test-helpers.js';

/**
 * Edge case test scenarios
 */
const testCases: TestCase[] = [
  // ─ Null and undefined edge cases
  {
    description: 'rejects null for required string field',
    toolName: 'read_file',
    input: { filepath: null },
    shouldValidate: false,
  },
  {
    description: 'rejects undefined for required string field',
    toolName: 'read_file',
    input: { filepath: undefined },
    shouldValidate: false,
  },

  // ─ Empty vs whitespace
  {
    description: 'accepts whitespace filepath (not empty)',
    toolName: 'read_file',
    input: { filepath: '   ' },
    shouldValidate: true,
  },
  {
    description: 'rejects zero-length string',
    toolName: 'run_command',
    input: { command: '' },
    shouldValidate: false,
  },

  // ─ Type coercion edge cases
  {
    description: 'rejects boolean true',
    toolName: 'read_file',
    input: { filepath: true },
    shouldValidate: false,
  },
  {
    description: 'rejects boolean false',
    toolName: 'read_file',
    input: { filepath: false },
    shouldValidate: false,
  },
  {
    description: 'rejects NaN',
    toolName: 'run_command',
    input: { command: NaN },
    shouldValidate: false,
  },
  {
    description: 'rejects Infinity',
    toolName: 'read_file',
    input: { filepath: Infinity },
    shouldValidate: false,
  },

  // ─ Object and array edge cases
  {
    description: 'rejects array when string expected',
    toolName: 'read_file',
    input: { filepath: ['file.ts'] },
    shouldValidate: false,
  },
  {
    description: 'rejects plain object when string expected',
    toolName: 'read_file',
    input: { filepath: { path: 'file.ts' } },
    shouldValidate: false,
  },

  // ─ Optional fields behavior
  {
    description: 'accepts omitted optional field (directory)',
    toolName: 'search_files',
    input: { pattern: '*.ts' },
    shouldValidate: true,
  },
  {
    description: 'accepts optional field with value',
    toolName: 'search_files',
    input: { pattern: '*.ts', directory: 'src' },
    shouldValidate: true,
  },

  // ─ Extra fields (should be ignored)
  {
    description: 'ignores extra fields not in schema',
    toolName: 'read_file',
    input: { filepath: 'file.ts', debug: true, extra: 'field' },
    shouldValidate: true,
  },
  {
    description: 'ignores extra fields but validates required ones',
    toolName: 'write_file',
    input: { filepath: 'f.ts', content: 'x', extra: true },
    shouldValidate: true,
  },

  // ─ Special characters in strings
  {
    description: 'accepts filepath with special characters',
    toolName: 'read_file',
    input: { filepath: 'src/[test]/file-name_v2.0.ts' },
    shouldValidate: true,
  },
  {
    description: 'accepts command with special characters',
    toolName: 'run_command',
    input: { command: 'echo "hello world" > file.txt' },
    shouldValidate: true,
  },
  {
    description: 'accepts pattern with glob special chars',
    toolName: 'search_files',
    input: { pattern: 'src/**/*.{ts,tsx}' },
    shouldValidate: true,
  },

  // ─ Very long strings
  {
    description: 'accepts very long filepath',
    toolName: 'read_file',
    input: { filepath: 'a'.repeat(500) + '.ts' },
    shouldValidate: true,
  },
  {
    description: 'accepts very long command',
    toolName: 'run_command',
    input: { command: 'echo ' + 'x'.repeat(1000) },
    shouldValidate: true,
  },

  // ─ Unicode and special strings
  {
    description: 'accepts unicode characters in filepath',
    toolName: 'read_file',
    input: { filepath: 'файл_文件_ファイル.ts' },
    shouldValidate: true,
  },
  {
    description: 'accepts emoji in command',
    toolName: 'run_command',
    input: { command: 'echo "✅ test passed"' },
    shouldValidate: true,
  },

  // ─ Newlines and whitespace edge cases
  {
    description: 'accepts newlines in content field',
    toolName: 'write_file',
    input: { filepath: 'file.ts', content: 'line1\nline2\nline3' },
    shouldValidate: true,
  },
  {
    description: 'accepts tabs in content field',
    toolName: 'append_file',
    input: { filepath: 'file.ts', content: '\t\t\tindented' },
    shouldValidate: true,
  },

  // ─ Multiple required fields all missing
  {
    description: 'rejects when all required fields missing',
    toolName: 'modify_file',
    input: {},
    shouldValidate: false,
  },
  {
    description: 'rejects when multiple required fields missing',
    toolName: 'write_file',
    input: { extra: 'field' },
    shouldValidate: false,
  },

  // ─ Partial required fields (some present, some missing)
  {
    description: 'rejects when some but not all required fields present',
    toolName: 'modify_file',
    input: { filepath: 'f.ts', find: 'a' },
    shouldValidate: false,
  },
  {
    description: 'rejects partial github input',
    toolName: 'github',
    input: { action: 'profile' },
    shouldValidate: false,
  },
];

/**
 * Run all edge case tests
 */
export async function runEdgeCaseTests(): Promise<{ passed: number; failed: number }> {
  return runTestSuite('Edge Case Tests', testCases);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEdgeCaseTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}

