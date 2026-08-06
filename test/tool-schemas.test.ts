/**
 * Tool Schema Tests
 * Tests each tool's specific schema validation rules (schema-only, no execution)
 */

import { TestCase, runTestSuite } from './utils/test-helpers.js';

// ─ read_file schema tests
const readFileTests: TestCase[] = [
  { description: 'valid filepath', toolName: 'read_file', input: { filepath: 'file.ts' }, shouldValidate: true },
  { description: 'empty filepath', toolName: 'read_file', input: { filepath: '' }, shouldValidate: false },
  { description: 'missing filepath', toolName: 'read_file', input: {}, shouldValidate: false },
  { description: 'number filepath', toolName: 'read_file', input: { filepath: 42 }, shouldValidate: false },
];

// ─ write_file schema tests
const writeFileTests: TestCase[] = [
  { description: 'valid filepath and content', toolName: 'write_file', input: { filepath: 'file.txt', content: 'x' }, shouldValidate: true },
  { description: 'empty filepath', toolName: 'write_file', input: { filepath: '', content: 'x' }, shouldValidate: false },
  { description: 'empty content', toolName: 'write_file', input: { filepath: 'file.txt', content: '' }, shouldValidate: false },
  { description: 'missing filepath', toolName: 'write_file', input: { content: 'x' }, shouldValidate: false },
  { description: 'missing content', toolName: 'write_file', input: { filepath: 'file.txt' }, shouldValidate: false },
];

// ─ append_file schema tests
const appendFileTests: TestCase[] = [
  { description: 'valid filepath and content', toolName: 'append_file', input: { filepath: 'file.txt', content: 'x' }, shouldValidate: true },
  { description: 'empty filepath', toolName: 'append_file', input: { filepath: '', content: 'x' }, shouldValidate: false },
  { description: 'empty content', toolName: 'append_file', input: { filepath: 'file.txt', content: '' }, shouldValidate: false },
];

// ─ modify_file schema tests
const modifyFileTests: TestCase[] = [
  { description: 'valid all fields', toolName: 'modify_file', input: { filepath: 'f.ts', find: 'a', replace: 'b' }, shouldValidate: true },
  { description: 'empty filepath', toolName: 'modify_file', input: { filepath: '', find: 'a', replace: 'b' }, shouldValidate: false },
  { description: 'empty find', toolName: 'modify_file', input: { filepath: 'f.ts', find: '', replace: 'b' }, shouldValidate: false },
  { description: 'empty replace', toolName: 'modify_file', input: { filepath: 'f.ts', find: 'a', replace: '' }, shouldValidate: false },
  { description: 'missing replace', toolName: 'modify_file', input: { filepath: 'f.ts', find: 'a' }, shouldValidate: false },
];

// ─ list_directory schema tests
const listDirTests: TestCase[] = [
  { description: 'valid path', toolName: 'list_directory', input: { path: 'src' }, shouldValidate: true },
  { description: 'no args (path optional)', toolName: 'list_directory', input: {}, shouldValidate: true },
  { description: 'number path', toolName: 'list_directory', input: { path: 123 }, shouldValidate: false },
];

// ─ run_command schema tests
const runCommandTests: TestCase[] = [
  { description: 'valid command', toolName: 'run_command', input: { command: 'ls' }, shouldValidate: true },
  { description: 'empty command', toolName: 'run_command', input: { command: '' }, shouldValidate: false },
  { description: 'missing command', toolName: 'run_command', input: {}, shouldValidate: false },
  { description: 'number command', toolName: 'run_command', input: { command: 42 }, shouldValidate: false },
];

// ─ search_files schema tests
const searchFilesTests: TestCase[] = [
  { description: 'valid pattern', toolName: 'search_files', input: { pattern: '*.ts' }, shouldValidate: true },
  { description: 'pattern and directory', toolName: 'search_files', input: { pattern: '*.ts', directory: 'src' }, shouldValidate: true },
  { description: 'missing pattern', toolName: 'search_files', input: { directory: 'src' }, shouldValidate: false },
  { description: 'empty pattern', toolName: 'search_files', input: { pattern: '' }, shouldValidate: false },
];

// ─ web_search schema tests
const webSearchTests: TestCase[] = [
  { description: 'valid query', toolName: 'web_search', input: { query: 'what is typescript' }, shouldValidate: true },
  { description: 'empty query', toolName: 'web_search', input: { query: '' }, shouldValidate: false },
  { description: 'missing query', toolName: 'web_search', input: {}, shouldValidate: false },
];

// ─ github schema tests
const githubTests: TestCase[] = [
  { description: 'valid profile action', toolName: 'github', input: { action: 'profile', username: 'user' }, shouldValidate: true },
  { description: 'valid repos action', toolName: 'github', input: { action: 'repos', username: 'user' }, shouldValidate: true },
  { description: 'with limit field', toolName: 'github', input: { action: 'repos', username: 'user', limit: '10' }, shouldValidate: true },
  { description: 'missing username', toolName: 'github', input: { action: 'profile' }, shouldValidate: false },
  { description: 'missing action', toolName: 'github', input: { username: 'user' }, shouldValidate: false },
  { description: 'invalid action value', toolName: 'github', input: { action: 'delete', username: 'user' }, shouldValidate: false },
];

/**
 * Run all individual tool schema tests
 */
export async function runToolSchemaTests(): Promise<{ passed: number; failed: number }> {
  let totalPassed = 0;
  let totalFailed = 0;

  const testSuites = [
    { name: 'read_file Schema', cases: readFileTests },
    { name: 'write_file Schema', cases: writeFileTests },
    { name: 'append_file Schema', cases: appendFileTests },
    { name: 'modify_file Schema', cases: modifyFileTests },
    { name: 'list_directory Schema', cases: listDirTests },
    { name: 'run_command Schema', cases: runCommandTests },
    { name: 'search_files Schema', cases: searchFilesTests },
    { name: 'web_search Schema', cases: webSearchTests },
    { name: 'github Schema', cases: githubTests },
  ];

  for (const suite of testSuites) {
    const result = await runTestSuite(suite.name, suite.cases);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  return { passed: totalPassed, failed: totalFailed };
}

