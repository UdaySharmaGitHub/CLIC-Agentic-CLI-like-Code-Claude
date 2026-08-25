import { pathToFileURL } from 'node:url';
import { toMarkdown, toJson, toHtml } from '../src/commands/export.js';
import type { ChatMessage } from '../src/memory.js';

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

function contains(desc: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected to contain: ${needle}`); }
}

export async function runExportTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nExport Command Tests');

  const msgs: ChatMessage[] = [
    { role: 'system', content: 'You are an assistant.' },
    { role: 'user', content: 'Hello world' },
    {
      role: 'assistant',
      content: 'Hi there!',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"foo.ts"}' } }],
    },
    { role: 'tool', content: 'file contents', tool_call_id: 'tc1' },
  ];

  // ── toMarkdown ──
  const md = toMarkdown(msgs, 'work', 'gpt-4o');
  contains('markdown: includes header', md, '# CLIC Conversation Export');
  contains('markdown: includes session name', md, 'work');
  contains('markdown: includes model', md, 'gpt-4o');
  contains('markdown: includes user message', md, 'Hello world');
  contains('markdown: includes assistant text', md, 'Hi there!');
  contains('markdown: tool call in details block', md, '<details>');
  contains('markdown: tool call shows name', md, 'read_file');
  eq('markdown: skips system messages', md.includes('You are an assistant.'), false);
  eq('markdown: skips tool role messages', md.includes('file contents'), false);

  // ── toJson ──
  const jsonStr = toJson(msgs, 'work', 'gpt-4o');
  const parsed = JSON.parse(jsonStr);
  eq('json: has exportedAt key', typeof parsed.exportedAt, 'string');
  eq('json: session field', parsed.session, 'work');
  eq('json: model field', parsed.model, 'gpt-4o');
  eq('json: messages is array of length 4', parsed.messages.length, 4);
  eq('json: first message is system', parsed.messages[0].role, 'system');

  // ── toHtml ──
  const html = toHtml(msgs, 'work', 'gpt-4o');
  contains('html: starts with DOCTYPE', html, '<!DOCTYPE html>');
  contains('html: includes session in title', html, 'work');
  contains('html: includes user bubble', html, 'Hello world');
  contains('html: includes assistant text', html, 'Hi there!');
  contains('html: tool call in details toggle', html, '<details>');
  contains('html: tool call shows name', html, 'read_file');
  contains('html: no external stylesheets', html, '<style>');
  eq('html: no CDN links', html.includes('cdn.'), false);
  eq('html: skips system messages content', html.includes('You are an assistant.'), false);

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExportTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
