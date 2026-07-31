// ─────────────────────────────────────────────────────────────────────────────
//  Tools — shared helpers (path resolution, diff rendering)
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import chalk from 'chalk';

export function resolvePath(filepath: string): string {
  if (filepath.startsWith('~')) {
    return path.join(process.env.HOME || '/', filepath.slice(1));
  }
  return path.resolve(filepath);
}

// Strip ANSI escape codes to measure visible length
function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Full-width background-highlighted diff, Claude Code CLI style.
// Additions  → green  background + green  "+" gutter marker
// Deletions  → red    background + red    "−" gutter marker
// Context    → dimmed with a plain " " gutter marker
// Hunk headers (@@…@@) → cyan accent separator
export function renderDiff(patch: string): void {
  const termWidth = process.stdout.columns || 100;
  // Reserve 2 leading spaces + box border character = use termWidth - 2 for the inner fill
  const fillWidth = termWidth - 2;

  // ── colour tokens ──────────────────────────────────────────────────────────
  const addBg    = chalk.bgHex('#0d2b0d');         // dark green background
  const addFg    = chalk.hex('#4ade80').bold;       // bright green text
  const addGutter = chalk.bgHex('#14521e').hex('#4ade80').bold; // gutter cell
  const delBg    = chalk.bgHex('#2b0d0d');         // dark red background
  const delFg    = chalk.hex('#f87171').bold;       // bright red text
  const delGutter = chalk.bgHex('#521414').hex('#f87171').bold; // gutter cell
  const ctxFg    = chalk.dim;                      // dimmed context text
  const ctxGutter = chalk.dim;
  const hunkColor = chalk.hex('#38bdf8');           // cyan hunk header

  // ── diff block container ───────────────────────────────────────────────────
  const borderTop    = chalk.dim(`  ╭${'─'.repeat(fillWidth - 2)}╮`);
  const borderBottom = chalk.dim(`  ╰${'─'.repeat(fillWidth - 2)}╯`);

  const hunkDivider = (hunk: string) => {
    const inner = ` ${hunkColor(hunk)} `;
    const pad   = Math.max(0, fillWidth - 4 - visLen(inner));
    return chalk.dim('  ├') + inner + chalk.dim('─'.repeat(pad)) + chalk.dim('┤');
  };

  // Render one content line with full-width bg fill and a gutter marker
  const renderLine = (
    sigil:   string,           // '+', '-', or ' '
    lineNum: string,           // right-aligned line number text
    code:    string,           // the actual code (without leading sigil)
    gutterFn: (s: string) => string,
    fgFn:    (s: string) => string,
    bgFn:    (s: string) => string,
  ) => {
    const gutterCell = gutterFn(` ${sigil} ${lineNum.padStart(4)} `); // 9 chars
    const codeFilled = bgFn(
      fgFn(code) + ' '.repeat(Math.max(0, fillWidth - 9 - 4 - visLen(code))),
    );
    // 2-space left margin + gutter + 2-space indent + code + bg fill to edge
    console.log(`  ${gutterCell}  ${codeFilled}`);
  };

  const lines  = patch.split('\n');
  let oldLine  = 0;
  let newLine  = 0;
  let inHeader = true;
  let hasDiff  = false;

  console.log();
  console.log(borderTop);

  // Print a "Changes" label row
  const label = chalk.bold.white('  Changes');
  const labelPad = ' '.repeat(Math.max(0, fillWidth - 4 - visLen(label)));
  console.log(`  ${chalk.dim('│')} ${label}${labelPad} ${chalk.dim('│')}`);

  for (const raw of lines) {
    // Skip unified-diff file header lines (--- / +++)
    if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('Index:') || raw.startsWith('=====')) {
      inHeader = false;
      continue;
    }

    // Hunk header: @@ -a,b +c,d @@
    if (raw.startsWith('@@')) {
      inHeader = false;
      hasDiff  = true;
      // Parse starting line numbers
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldLine = parseInt(m[1], 10); newLine = parseInt(m[2], 10); }
      console.log(hunkDivider(raw));
      continue;
    }

    if (inHeader || raw === '') continue;

    const sigil = raw[0];
    const code  = raw.slice(1);  // strip leading +/-/

    if (sigil === '+') {
      renderLine('+', String(newLine), code, addGutter, addFg, addBg);
      newLine++;
    } else if (sigil === '-') {
      renderLine('−', String(oldLine), code, delGutter, delFg, delBg);
      oldLine++;
    } else {
      // context line
      renderLine(' ', String(newLine), code, ctxGutter, ctxFg, ctxFg);
      oldLine++;
      newLine++;
    }
  }

  if (!hasDiff) {
    const msg = chalk.dim('  (no changes)');
    const pad = ' '.repeat(Math.max(0, fillWidth - 4 - visLen(msg)));
    console.log(`  ${chalk.dim('│')} ${msg}${pad} ${chalk.dim('│')}`);
  }

  console.log(borderBottom);
  console.log();
}
