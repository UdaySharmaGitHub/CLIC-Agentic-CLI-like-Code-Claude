/**
 * Zod Validation Gate Tests
 * Tests the core validation gate in executeTool()
 * These test fundamental validation behavior across all tools
 */

import { pathToFileURL } from 'node:url';
import { TestCase, runTestSuite } from './utils/test-helpers.js';

/**
 * Test cases for the core validation gate
 * Each test validates schema only, without executing the tool
 */
const testCases: TestCase[] = [
  // ─ Type enforcement: strings required, numbers rejected
  {
    description: 'rejects number when string expected',
    toolName: 'read_file',
    input: { filepath: 42 },
    shouldValidate: false,
  },
  {
    description: 'rejects number for command field',
    toolName: 'run_command',
    input: { command: 123 },
    shouldValidate: false,
  },

  // ─ Type enforcement: booleans and objects rejected
  {
    description: 'rejects boolean when string expected',
    toolName: 'read_file',
    input: { filepath: true },
    shouldValidate: false,
  },
  {
    description: 'rejects object when string expected',
    toolName: 'search_files',
    input: { pattern: { nested: 'object' } },
    shouldValidate: false,
  },

  // ─ Required field enforcement
  {
    description: 'rejects empty object (all fields required)',
    toolName: 'read_file',
    input: {},
    shouldValidate: false,
  },
  {
    description: 'rejects missing command field',
    toolName: 'run_command',
    input: {},
    shouldValidate: false,
  },
  {
    description: 'rejects partial input (missing required fields)',
    toolName: 'write_file',
    input: { filepath: 'test.txt' },
    shouldValidate: false,
  },

  // ─ Empty string handling (min:1 constraint)
  {
    description: 'rejects empty filepath string',
    toolName: 'read_file',
    input: { filepath: '' },
    shouldValidate: false,
  },
  {
    description: 'rejects empty command string',
    toolName: 'run_command',
    input: { command: '' },
    shouldValidate: false,
  },
  {
    description: 'rejects empty pattern string',
    toolName: 'search_files',
    input: { pattern: '' },
    shouldValidate: false,
  },

  // ─ Valid inputs that should pass validation
  {
    description: 'accepts valid filepath',
    toolName: 'read_file',
    input: { filepath: 'src/main.ts' },
    shouldValidate: true,
  },
  {
    description: 'accepts valid command',
    toolName: 'run_command',
    input: { command: 'ls -la' },
    shouldValidate: true,
  },
  {
    description: 'accepts pattern and optional directory',
    toolName: 'search_files',
    input: { pattern: '*.ts', directory: 'src' },
    shouldValidate: true,
  },

  // ─ Optional fields
  {
    description: 'accepts pattern without optional directory',
    toolName: 'search_files',
    input: { pattern: '*.json' },
    shouldValidate: true,
  },
  {
    description: 'accepts no args when all fields optional',
    toolName: 'list_directory',
    input: {},
    shouldValidate: true,
  },

  // ─ Null and undefined handling
  {
    description: 'rejects null when string expected',
    toolName: 'read_file',
    input: { filepath: null },
    shouldValidate: false,
  },
  {
    description: 'rejects undefined filepath',
    toolName: 'read_file',
    input: { filepath: undefined },
    shouldValidate: false,
  },

  // ─ Valid github input
  {
    description: 'accepts valid github profile input',
    toolName: 'github',
    input: { action: 'profile', username: 'torvalds' },
    shouldValidate: true,
  },
];

/**
 * Run all validation gate tests
 */
export async function runValidationGateTests(): Promise<{
  passed: number;
  failed: number;
}> {
  return runTestSuite('Validation Gate Tests', testCases);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runValidationGateTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}

