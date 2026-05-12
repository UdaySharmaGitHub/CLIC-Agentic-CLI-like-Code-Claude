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
    '  ██████╗██╗     ██╗ ██████╗ ',
    ' ██╔════╝██║     ██║██╔════╝ ',
    ' ██║     ██║     ██║██║      ',
    ' ██║     ██║     ██║██║      ',
    ' ╚██████╗███████╗██║╚██████╗ ',
    '  ╚═════╝╚══════╝╚═╝ ╚═════╝ ',
  ];

  // ── Diagonal-gradient logo (centered) ──
  const maxLogoLen = Math.max(...logo.map((l) => l.length));
  const termWidth  = process.stdout.columns || 80;
  const logoPad    = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));
  const gradedLogo = logoGradient(logo);
  for (const line of gradedLogo) {
    console.log(`${logoPad}${line}`);
    await delay(60);
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
    `${chalk.hex('#C084FC').bold('v4.2')}${sep}` +
    `${chalk.dim('SAP AI Core')}${sep}` +
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

  console.log(boxTop());
  console.log(boxLine(`${accentBold('🧠 Capabilities')}`));
  console.log(boxDiv());

  const caps: [string, string, string][] = [
    ['💬', 'Chat / Q&A',     'Any topic — code, math, devops, science'],
    ['⚙️',  'Run Commands',   'Safe shell commands with approval'],
    ['📖', 'Read Files',     'Read and analyze file contents'],
    ['✏️',  'Write Files',    'Create or overwrite files'],
    ['➕', 'Append Files',   'Add content to existing files'],
    ['🔧', 'Modify Files',   'Find-and-replace text in files'],
    ['📂', 'List Dirs',      'Browse directory listings'],
    ['🔍', 'Search Files',   'Glob-based file search'],
    ['🌐', 'Web Search',     'Search and scrape from the web'],
    ['🔗', 'Agentic Loop',   'Auto-chains steps until task done'],
    ['📚', 'Knowledge Base', 'Role/behavior loaded from file'],
  ];

  for (const [icon, name, desc] of caps) {
    const lbl = chalk.white(name.padEnd(17));
    console.log(boxLine(`  ${icon} ${lbl}${chalk.dim(desc)}`));
  }

  console.log(boxBottom());
  console.log();

  console.log(boxTop());
  console.log(boxLine(`${chalk.yellow.bold('⌘  Commands')}`));
  console.log(boxDiv());

  const cmds: [string, string][] = [
    ['/compact',  'Summarize & compress conversation history'],
    ['/model',    'Switch model mid-session (/model [name])'],
    ['/role',     'Switch knowledge base / persona'],
    ['/undo',     'Remove last user + assistant exchange'],
    ['/retry',    'Regenerate last response  (alias: /r)'],
    ['/tokens',   'Show estimated token usage'],
    ['/status',   'Show system info'],
    ['/history',  'Show conversation history'],
    ['/clear',    'Clear chat history'],
    ['/raw',      'Toggle raw JSON debug output'],
    ['/help',     'Show this menu'],
    ['/exit',     'Quit the agent'],
  ];

  for (const [cmd, desc] of cmds) {
    const lbl = accent(cmd.padEnd(12));
    console.log(boxLine(`  ${lbl}${chalk.dim(desc)}`));
  }

  console.log(boxBottom());
  console.log();

  console.log(boxTop());
  console.log(boxLine(`${accentBold('💡 Try these')}`));
  console.log(boxDiv());
  console.log(boxLine(chalk.dim('  "what is the difference between TCP and UDP?"')));
  console.log(boxLine(chalk.dim('  "list all python files in current directory"')));
  console.log(boxLine(chalk.dim('  "create a test.py with a bug then fix it"')));
  console.log(boxLine(chalk.dim('  "read config.json and update the port to 9000"')));
  console.log(boxLine(chalk.dim('  "create a hello.sh, make it executable, run it"')));
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
