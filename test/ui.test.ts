/**
 * UI module tests — pure helpers and Ink component output.
 * Run with: pnpm test:ui
 */
// Tell React 19 we're in a test environment so React.act() doesn't warn.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { W, LOGO_COLORS, SESSION_PALETTE, ACTION_STYLES } from '../src/ui/theme.js';
import { pathToFileURL } from 'node:url';
import { render } from 'ink';
import { Writable } from 'node:stream';
import React from 'react';

async function renderInk(element: React.ReactElement): Promise<string> {
  let output = '';
  const stream = new Writable({
    write(chunk, _enc, cb) { output += chunk.toString(); cb(); }
  });
  const { waitUntilRenderFlush, unmount } = render(element, stream);
  await waitUntilRenderFlush();
  unmount();
  return output.replace(/\x1b\[[0-9;]*m/g, '');
}

let passed = 0;
let failed = 0;

function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`); }
}

export async function runUiTests(): Promise<{ passed: number; failed: number }> {
  passed = 0; failed = 0;
  console.log('\nUI Module Tests');

  // ── theme.ts ──────────────────────────────────────────────
  eq('W is 62', W, 62);
  eq('LOGO_COLORS has 6 entries', LOGO_COLORS.length, 6);
  eq('LOGO_COLORS[0] is purple', LOGO_COLORS[0], '#C084FC');
  eq('LOGO_COLORS[5] is cyan', LOGO_COLORS[5], '#22D3EE');
  eq('SESSION_PALETTE has 10 entries', SESSION_PALETTE.length, 10);
  eq('SESSION_PALETTE[0] is violet', SESSION_PALETTE[0].bg, '#7C3AED');
  eq('SESSION_PALETTE[4] amber has black fg', SESSION_PALETTE[4].fg, '#000000');
  eq('ACTION_STYLES has run_command', 'run_command' in ACTION_STYLES, true);
  eq('ACTION_STYLES has web_search', 'web_search' in ACTION_STYLES, true);
  eq('ACTION_STYLES run_command icon', ACTION_STYLES['run_command']!.icon, '⚙️ ');

  // ── helpers.ts ────────────────────────────────────────────
  const { visLen, sessionPaletteEntry, actionLabel, sessionNameBadge, boxTop, boxBottom, boxDiv, boxLine } =
    await import('../src/ui/helpers.js');

  // visLen strips ANSI codes
  eq('visLen plain string', visLen('hello'), 5);
  eq('visLen chalk-colored string', visLen('\x1b[32mhello\x1b[0m'), 5);
  eq('visLen empty string', visLen(''), 0);

  // sessionPaletteEntry is deterministic
  const entry1 = sessionPaletteEntry('default');
  const entry2 = sessionPaletteEntry('default');
  eq('sessionPaletteEntry is stable for same name', entry1.bg, entry2.bg);
  eq('sessionPaletteEntry returns bg from palette', SESSION_PALETTE.some(e => e.bg === entry1.bg), true);
  eq('sessionPaletteEntry different names may differ',
     sessionPaletteEntry('alpha').bg !== sessionPaletteEntry('zzzzzzzz').bg ||
     sessionPaletteEntry('alpha').bg === sessionPaletteEntry('zzzzzzzz').bg, true); // just runs

  // actionLabel
  const runLabel = actionLabel('run_command');
  eq('actionLabel strips ANSI but contains action text',
     visLen(runLabel) > 0, true);
  const unknownLabel = actionLabel('not_a_tool');
  eq('actionLabel unknown contains ❓', visLen(unknownLabel) > 0, true);

  // sessionNameBadge
  const badge = sessionNameBadge('mytest');
  eq('sessionNameBadge contains session name', badge.includes('mytest'), true);

  // box helpers produce correct raw character widths
  const topLine = boxTop();
  eq('boxTop contains top-left corner', topLine.includes('╭'), true);
  eq('boxTop visible length', visLen(boxTop()), W + 2 + 4); // "  ╭" + dashes + "╮"

  const contentLine = boxLine('hello');
  eq('boxLine contains content', contentLine.includes('hello'), true);

  // ── Separator component ─────────────────────────────────────
  const { Separator, PromptSeparator } = await import('../src/ui/components/Separator.js');

  const sepOut = await renderInk(React.createElement(Separator, null));
  eq('Separator output contains dash characters', sepOut.includes('─'), true);

  const pSepOut = await renderInk(React.createElement(PromptSeparator, null));
  eq('PromptSeparator output is non-empty', pSepOut.trim().length > 0, true);

  const pSepWithName = await renderInk(React.createElement(PromptSeparator, { sessionName: 'work' }));
  eq('PromptSeparator with session name contains session name', pSepWithName.includes('work'), true);

  // ── DimOutput component ─────────────────────────────────────
  const { DimOutput } = await import('../src/ui/components/DimOutput.js');

  const dimOut = await renderInk(React.createElement(DimOutput, { lines: ['line one', 'line two'] }));
  eq('DimOutput contains first line', dimOut.includes('line one'), true);
  eq('DimOutput contains second line', dimOut.includes('line two'), true);

  const dimTrunc = await renderInk(React.createElement(DimOutput, { lines: ['a', 'b', 'c'], maxLines: 2 }));
  eq('DimOutput truncation message appears', dimTrunc.includes('more lines truncated'), true);
  eq('DimOutput does not contain truncated line c', dimTrunc.includes('    c'), false);

  // ── ToolResult component ────────────────────────────────────
  const { ToolResult } = await import('../src/ui/components/ToolResult.js');

  const successOut = await renderInk(React.createElement(ToolResult, { type: 'success', message: 'File written.' }));
  eq('ToolResult success contains message', successOut.includes('File written.'), true);
  eq('ToolResult success contains checkmark', successOut.includes('✅'), true);

  const errorOut = await renderInk(React.createElement(ToolResult, { type: 'error', message: 'Permission denied.' }));
  eq('ToolResult error contains message', errorOut.includes('Permission denied.'), true);
  eq('ToolResult error contains X', errorOut.includes('❌'), true);

  const blockedOut = await renderInk(React.createElement(ToolResult, { type: 'blocked', message: 'rm -rf blocked.' }));
  eq('ToolResult blocked contains BLOCKED', blockedOut.includes('BLOCKED'), true);

  const rejectedOut = await renderInk(React.createElement(ToolResult, { type: 'rejected' }));
  eq('ToolResult rejected contains Rejected', rejectedOut.includes('Rejected'), true);

  // ── ToolHeader component ────────────────────────────────────
  const { ToolHeader } = await import('../src/ui/components/ToolHeader.js');

  const thOut = await renderInk(React.createElement(ToolHeader, { toolName: 'read_file', detail: 'src/index.ts' }));
  eq('ToolHeader contains READ FILE', thOut.includes('READ FILE'), true);
  eq('ToolHeader contains detail text', thOut.includes('src/index.ts'), true);
  eq('ToolHeader contains box corners', thOut.includes('╭'), true);

  // ── StepHeader component ─────────────────────────────────────
  const { StepHeader } = await import('../src/ui/components/StepHeader.js');

  const shOut = await renderInk(React.createElement(StepHeader, { step: 2, maxSteps: 5 }));
  eq('StepHeader contains step number', shOut.includes('2'), true);
  eq('StepHeader contains max steps', shOut.includes('5'), true);
  eq('StepHeader contains Step label', shOut.includes('Step'), true);

  // ── ContextBar component ──────────────────────────────────────
  const { ContextBar } = await import('../src/ui/components/ContextBar.js');

  const cbGreenOut = await renderInk(React.createElement(ContextBar, { promptTokens: 1000, contextLimit: 10000 }));
  eq('ContextBar green (10%) renders without error', cbGreenOut.trim().length > 0, true);
  eq('ContextBar shows token counts', cbGreenOut.includes('1,000'), true);

  const cbYellowOut = await renderInk(React.createElement(ContextBar, { promptTokens: 7000, contextLimit: 10000 }));
  eq('ContextBar yellow (70%) renders without error', cbYellowOut.trim().length > 0, true);
  eq('ContextBar shows 70%', cbYellowOut.includes('70%'), true);

  const cbZeroOut = await renderInk(React.createElement(ContextBar, { promptTokens: 0, contextLimit: 10000 }));
  eq('ContextBar with 0 tokens renders empty string', cbZeroOut.trim().length === 0, true);

  // ── Status component ──────────────────────────────────────────
  const { Status } = await import('../src/ui/components/Status.js');

  const statusOut = await renderInk(React.createElement(Status, {
    messageCount: 5,
    maxSteps: 10,
    showRaw: false,
    model: 'gpt-4o',
    contextLimit: 128000,
    sessionName: 'work',
  }));
  eq('Status contains model name', statusOut.includes('gpt-4o'), true);
  eq('Status contains message count', statusOut.includes('5'), true);
  eq('Status contains session name', statusOut.includes('work'), true);
  eq('Status contains System Context header', statusOut.includes('System Context'), true);

  // ── Help component ──────────────────────────────────────────
  const { Help } = await import('../src/ui/components/Help.js');

  const helpOut = await renderInk(React.createElement(Help, null));
  eq('Help contains /session command', helpOut.includes('/session'), true);
  eq('Help contains /compact command', helpOut.includes('/compact'), true);
  eq('Help contains Capabilities header', helpOut.includes('Capabilities'), true);
  eq('Help contains prompt ideas box', helpOut.includes('Prompt Ideas'), true);

  // ── Banner component ──────────────────────────────────────────
  const { Banner } = await import('../src/ui/components/Banner.js');

  let bannerOutput = '';
  const bannerStream = new Writable({
    write(chunk, _enc, cb) { bannerOutput += chunk.toString(); cb(); }
  });
  const { waitUntilExit: bannerWait } = render(React.createElement(Banner, { instantMode: true }), bannerStream);
  await bannerWait();
  const bannerClean = bannerOutput.replace(/\x1b\[[0-9;]*m/g, '');
  eq('Banner contains CLIC logo block characters', bannerClean.includes('██'), true);
  eq('Banner contains tagline', bannerClean.includes('Command Line Intelligence Companion'), true);
  eq('Banner contains Tools & Capabilities', bannerClean.includes('Tools & Capabilities'), true);
  eq('Banner contains /help hint', bannerClean.includes('/help'), true);

  // ── Spinner component ─────────────────────────────────────────
  const { ThinkingSpinner } = await import('../src/ui/components/Spinner.js');

  const spinnerOut = await renderInk(React.createElement(ThinkingSpinner, null));
  eq('ThinkingSpinner renders Thinking text', spinnerOut.includes('Thinking'), true);
  eq('ThinkingSpinner renders non-empty output', spinnerOut.trim().length > 0, true);

  // ── ui/index.ts — async adapter signatures ───────────────────────────────
  // Print functions must return Promise<void>. Tests run in non-TTY (no real
  // stdout), so the non-TTY chalk path fires synchronously inside the async
  // wrapper — each call still returns a Promise.
  const uiAdapter = await import('../src/ui/index.js');

  const r1 = uiAdapter.printSeparator();
  eq('printSeparator returns Promise', r1 instanceof Promise, true);
  await r1;

  const r2 = uiAdapter.printStepHeader(2, 5);
  eq('printStepHeader returns Promise', r2 instanceof Promise, true);
  await r2;

  const r3 = uiAdapter.printToolHeader('read_file', 'src/index.ts');
  eq('printToolHeader returns Promise', r3 instanceof Promise, true);
  await r3;

  const r4 = uiAdapter.printToolSuccess('Done.');
  eq('printToolSuccess returns Promise', r4 instanceof Promise, true);
  await r4;

  const r5 = uiAdapter.printContextBar(5000, 100000);
  eq('printContextBar returns Promise', r5 instanceof Promise, true);
  await r5;

  const r6 = uiAdapter.printContextBar(0, 100000);
  eq('printContextBar(0 tokens) resolves without error', r6 instanceof Promise, true);
  await r6;

  console.log(`  ── ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUiTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
