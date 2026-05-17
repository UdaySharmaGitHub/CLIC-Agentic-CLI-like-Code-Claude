// ─────────────────────────────────────────────────────────────────────────────
//  UI — banner, colors, formatters  (Claude-Code-inspired design)
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';

// ── Delay helper ─────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Box-drawing helpers ──────────────────────────────────────────────────────

const W = 62; // inner content width

function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function boxTop(w = W): string {
  return chalk.dim(`  ╭${'─'.repeat(w + 2)}╮`);
}
function boxBottom(w = W): string {
  return chalk.dim(`  ╰${'─'.repeat(w + 2)}╯`);
}
function boxDiv(w = W): string {
  return chalk.dim(`  ├${'─'.repeat(w + 2)}┤`);
}
function boxLine(content: string, w = W): string {
  const pad = Math.max(0, w - visLen(content));
  return `  ${chalk.dim('│')} ${content}${' '.repeat(pad)} ${chalk.dim('│')}`;
}
// ── Gradient palette ─────────────────────────────────────────────────────────

const accent = chalk.hex('#60E1F0');
const accentBold = chalk.hex('#60E1F0').bold;

// Purple → cyan diagonal gradient applied to logo characters
const LOGO_COLORS = ['#C084FC', '#A78BFA', '#818CF8', '#60A5FA', '#38BDF8', '#22D3EE'];

function logoGradient(lines: string[]): string[] {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const maxDiag = (lines.length - 1) + (maxLen - 1);
  return lines.map((line, row) =>
    line.split('').map((ch, col) => {
      if (ch === ' ') return ch;
      const t = maxDiag === 0 ? 0 : (row + col) / maxDiag;
      const idx = Math.min(Math.floor(t * LOGO_COLORS.length), LOGO_COLORS.length - 1);
      return chalk.hex(LOGO_COLORS[idx]).bold(ch);
    }).join('')
  );
}

// ── Banner ───────────────────────────────────────────────────────────────────

export async function printBanner(): Promise<void> {
  console.clear();
  console.log();

  const logo = [
    '  ██████╗ ██╗      ██╗  ██████╗ ',
    ' ██╔════╝ ██║      ██║ ██╔════╝ ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ██║      ██║      ██║ ██║      ',
    ' ╚██████╗ ███████╗ ██║ ╚██████╗ ',
    '  ╚═════╝ ╚══════╝ ╚═╝  ╚═════╝ ',
  ];

  // ── Diagonal-gradient logo (centered) ──
  const maxLogoLen = Math.max(...logo.map((l) => l.length));
  const termWidth  = process.stdout.columns || 80;
  const logoPad    = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));
  const gradedLogo = logoGradient(logo);
  for (const line of gradedLogo) {
    console.log(`${logoPad}${line}`);
    await delay(80);
  }

  console.log();

  // ── Tagline (centered) ──
  const divider = chalk.dim('─'.repeat(18));
  const star    = chalk.hex('#C084FC')('✦');
  const title   = chalk.bold.white('Command Line Intelligence Companion');
  const tagline = `${divider} ${star} ${title} ${star} ${divider}`;
  const taglinePad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(tagline)) / 2)));
  console.log(`${taglinePad}${tagline}`);
  console.log();

  // ── Info badges (centered) ──
  const sep  = chalk.dim(' · ');
  const info =
    `${chalk.hex('#C084FC').bold('v4.3')}${sep}` +
    `${chalk.dim('Anthropic & OpenAI & Google')}${sep}` +
    `${chalk.hex('#22D3EE')('Multi-Model Orchestration')}${sep}` +
    `${chalk.hex('#34D399').bold('● Ready')}`;
  const infoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(info)) / 2)));
  console.log(`${infoPad}${info}`);
  console.log();

  // ── Compact 3-column tools panel ──
  console.log(boxTop());
  console.log(boxLine(`${accentBold('⚡ Tools & Capabilities')}`));
  console.log(boxDiv());

  const tools: [string, string][] = [
    ['💬', 'chat'],      ['⚙️ ', 'command'],   ['📖', 'read'],
    ['✏️ ', 'write'],    ['➕',  'append'],     ['🔧', 'modify'],
    ['📂', 'list'],      ['🔍', 'search'],      ['🌐', 'web'],
    ['🔗', 'agentic'],   ['📚', 'knowledge'],
  ];

  const NAME_W = 10;
  for (let i = 0; i < tools.length; i += 3) {
    const row = tools.slice(i, i + 3) as [string, string][];
    const cells = row.map(([icon, name]) =>
      `${icon} ${accent(name)}${' '.repeat(Math.max(0, NAME_W - name.trim().length))}`,
    );
    while (cells.length < 3) cells.push(' '.repeat(NAME_W + 3));
    console.log(boxLine(`  ${cells.join('  ')}`));
    await delay(25);
  }

  console.log(boxBottom());
  console.log();

  // ── Hints ──
  console.log(`    ${chalk.dim('▸ Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`);
  console.log(`    ${chalk.dim('▸ /compact · /model · /role · /undo · /retry · /tokens · /clear · /exit')}`);
  console.log();
}

// ── Help ─────────────────────────────────────────────────────────────────────

export function printHelp(): void {
  console.log();

  // ── 2-column layout constants ──────────────────────────────────────
  // W2=73: inner width of the merged box.
  // LW=34: visible width of the left column (before the │ divider).
  // The │ divider lands at terminal column 39, so ┬/┼/┴ sit at offset 36
  // from the first dash of the top/divider/bottom borders.
  const W2 = 73;
  const LW = 34;

  const box2Top    = () => chalk.dim(`  ╭${'─'.repeat(36)}┬${'─'.repeat(38)}╮`);
  const box2Div    = () => chalk.dim(`  ├${'─'.repeat(36)}┼${'─'.repeat(38)}┤`);
  const box2Bottom = () => chalk.dim(`  ╰${'─'.repeat(36)}┴${'─'.repeat(38)}╯`);

  const splitRow = (left: string, right: string): string => {
    const lpad = ' '.repeat(Math.max(0, LW - visLen(left)));
    return boxLine(`${left}${lpad}${chalk.dim(' │ ')}${right}`, W2);
  };

  const capCat  = (lbl: string) => `  ${chalk.hex('#818CF8')('┄')}  ${chalk.hex('#A78BFA').bold(lbl)}`;
  const capItem = (icon: string, name: string) => `  ${icon} ${chalk.white(name)}`;
  const cmdCat  = (lbl: string) => `  ${chalk.hex('#F59E0B')('┄')}  ${chalk.hex('#FCD34D').bold(lbl)}`;
  const cmdItem = (cmd: string, desc: string) => `  ${accent(cmd.padEnd(10))}${chalk.dim(desc)}`;

  // Left column — Capabilities (17 rows)
  const L: string[] = [
    capCat('Conversation'),
    capItem('💬', 'Chat / Q&A'),
    capItem('🔗', 'Agentic Loop'),
    capItem('📚', 'Knowledge Base'),
    '',
    capCat('Files & Filesystem'),
    capItem('📖', 'Read'),
    capItem('✏️',  'Write'),
    capItem('➕', 'Append'),
    capItem('🔧', 'Modify'),
    capItem('📂', 'List Dirs'),
    '',
    capCat('External'),
    capItem('⚙️',  'Run Commands'),
    capItem('🔍', 'Search'),
    capItem('🌐', 'Web Search'),
    '',
  ];

  // Right column — Commands (17 rows)
  const R: string[] = [
    cmdCat('Session'),
    cmdItem('/compact',  'Summarize history'),
    cmdItem('/clear',    'Clear chat'),
    cmdItem('/undo',     'Remove last exchange'),
    cmdItem('/retry',    'Regenerate  /r'),
    cmdItem('/exit',     'Quit'),
    '',
    cmdCat('Configuration'),
    cmdItem('/model',    'Switch model'),
    cmdItem('/role',     'Switch persona'),
    '',
    cmdCat('Information'),
    cmdItem('/tokens',   'Token usage'),
    cmdItem('/status',   'System info'),
    cmdItem('/history',  'Show history'),
    cmdItem('/raw',      'Debug output'),
    cmdItem('/help',     'Show this menu'),
  ];

  // ── Render combined box ───────────────────────────────────────────
  console.log(box2Top());
  console.log(splitRow(accentBold('🧠 Capabilities'), chalk.yellow.bold('⌘  Commands')));
  console.log(box2Div());

  const maxLen = Math.max(L.length, R.length);
  for (let i = 0; i < maxLen; i++) {
    console.log(splitRow(L[i] ?? '', R[i] ?? ''));
  }

  console.log(box2Bottom());
  console.log();

  // ── Prompt Ideas ──────────────────────────────────────────────────
  const ideas: [string, string][] = [
    ['①', 'what is the difference between TCP and UDP?'],
    ['②', 'list all python files in current directory'],
    ['③', 'create a test.py with a bug then fix it'],
    ['④', 'read config.json and update the port to 9000'],
    ['⑤', 'create a hello.sh, make it executable, run it'],
  ];

  console.log(boxTop());
  console.log(boxLine(`${accentBold('💡 Prompt Ideas')}`));
  console.log(boxDiv());
  for (const [num, idea] of ideas) {
    console.log(boxLine(`  ${accent(num)}  ${chalk.dim(`"${idea}"`)}`));
  }
  console.log(boxBottom());
  console.log();
}

// ── Status ───────────────────────────────────────────────────────────────────

export function printStatus(opts: {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
}): void {
  console.log();
  console.log(boxTop());
  console.log(boxLine(`${accentBold('📊 System Context')}`));
  console.log(boxDiv());

  const rows: [string, string][] = [
    ['🖥  OS',        `${os.type()} (${os.arch()})`],
    ['👤 User',      `${os.userInfo().username}@${os.hostname()}`],
    ['🐚 Shell',     path.basename(process.env.SHELL || 'unknown')],
    ['📁 CWD',       process.cwd()],
    ['📅 Date',      new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['🤖 Model',     opts.model],
    ['💬 History',   `${opts.messageCount} messages`],
    ['🔄 Max Steps', `${opts.maxSteps} per turn`],
    ['🐛 Debug Raw', opts.showRaw ? chalk.yellow('on') : chalk.dim('off')],
    ['📚 KB Role',   opts.kbFile ? `${chalk.green('● Loaded')} ${chalk.dim(`(${opts.kbFile})`)}` : chalk.dim('not loaded')],
  ];

  for (const [key, val] of rows) {
    console.log(boxLine(`  ${chalk.dim(key.padEnd(14))}${val}`));
  }

  console.log(boxBottom());
  console.log();
}

// ── Step header ──────────────────────────────────────────────────────────────

export function printStepHeader(step: number, maxSteps: number): void {
  console.log();
  const badge = chalk.bgHex('#0d2137').hex('#60E1F0').bold(` ⟳ Step ${step} / ${maxSteps} `);
  const trail = chalk.dim('─'.repeat(W - 10));
  console.log(`  ${badge}  ${trail}`);
}

// ── Action labels ────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { icon: string; color: (s: string) => string }> = {
  run_command:     { icon: '⚙️ ', color: chalk.yellow },
  read_file:       { icon: '📖', color: chalk.hex('#60E1F0') },
  write_file:      { icon: '✏️ ', color: chalk.hex('#C084FC') },
  append_file:     { icon: '➕', color: chalk.hex('#C084FC') },
  modify_file:     { icon: '🔧', color: chalk.hex('#F59E0B') },
  list_directory:  { icon: '📂', color: chalk.hex('#60E1F0') },
  search_files:    { icon: '🔍', color: chalk.hex('#34D399') },
  web_search:      { icon: '🌐', color: chalk.hex('#34D399') },
};

export function actionLabel(action: string): string {
  const style = ACTION_STYLES[action];
  if (!style) return chalk.dim(`❓ ${action}`);
  const name = action.replace(/_/g, ' ').toUpperCase();
  return style.color(`${style.icon} ${name}`);
}

// ── Separators & tool output ─────────────────────────────────────────────────

export function printSeparator(): void {
  console.log(chalk.dim(`  ${'─'.repeat(W + 4)}`));
}

export function promptPrintSeperator():void{
  console.log(chalk.cyanBright(`  ${'─'.repeat(W + 5)}`));
}

export function printToolHeader(toolName: string, detail: string): void {
  console.log();
  console.log(boxTop());
  console.log(boxLine(chalk.bold(actionLabel(toolName))));
  console.log(boxDiv());
  console.log(boxLine(`📝 ${chalk.dim(detail)}`));
  console.log(boxBottom());
}

export function printToolSuccess(message: string): void {
  console.log(`  ${chalk.green('✅')} ${chalk.green(message)}`);
}

export function printToolError(message: string): void {
  console.log(`  ${chalk.red('❌')} ${chalk.red(message)}`);
}

export function printToolBlocked(message: string): void {
  console.log(`  ${chalk.bgRed.white.bold(' 🚫 BLOCKED ')} ${chalk.red(message)}`);
}

export function printRejected(): void {
  console.log(`  ${chalk.red('❌')} ${chalk.dim('Rejected by user.')}`);
}

export function printDimOutput(lines: string[], maxLines = 50): void {
  const arr = lines.slice(0, maxLines);
  for (const line of arr) {
    console.log(chalk.dim(`    ${line}`));
  }
  if (lines.length > maxLines) {
    console.log(chalk.dim(`    ⋯ (${lines.length - maxLines} more lines truncated)`));
  }
}
