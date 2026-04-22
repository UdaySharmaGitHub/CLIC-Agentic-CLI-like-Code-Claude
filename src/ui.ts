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
function boxEmpty(w = W): string {
  return boxLine('', w);
}

// ── Gradient palette ─────────────────────────────────────────────────────────

const G = [
  chalk.hex('#60E1F0'),
  chalk.hex('#47C8E0'),
  chalk.hex('#2FB0D0'),
  chalk.hex('#1A98C0'),
  chalk.hex('#0880B0'),
  chalk.hex('#006AA0'),
];

const accent = chalk.hex('#60E1F0');
const accentBold = chalk.hex('#60E1F0').bold;
const purple = chalk.hex('#C084FC');
const amber = chalk.hex('#F59E0B');
const mint = chalk.hex('#34D399');

// ── Animated line printer ────────────────────────────────────────────────────

async function typeLine(text: string, ms = 12): Promise<void> {
  // eslint-disable-next-line no-control-regex
  const parts = text.split(/(\x1b\[[0-9;]*m)/);
  for (const part of parts) {
    // ANSI escape sequences are printed instantly
    if (/^\x1b\[/.test(part)) {
      process.stdout.write(part);
    } else {
      for (const ch of part) {
        process.stdout.write(ch);
        await delay(ms);
      }
    }
  }
  process.stdout.write('\n');
}

async function animateLines(lines: string[], perLine = 35): Promise<void> {
  for (const line of lines) {
    console.log(line);
    await delay(perLine);
  }
}

// ── Banner ───────────────────────────────────────────────────────────────────

export async function printBanner(): Promise<void> {
  console.clear();
  console.log();

  const logo = [
    '   ██████╗██╗     ██╗ ██████╗ ',
    '  ██╔════╝██║     ██║██╔════╝ ',
    '  ██║     ██║     ██║██║      ',
    '  ██║     ██║     ██║██║      ',
    '  ╚██████╗███████╗██║╚██████╗ ',
    '   ╚═════╝╚══════╝╚═╝ ╚═════╝',
  ];

  // ── Animate logo lines with gradient ──
  for (let i = 0; i < logo.length; i++) {
    console.log(`    ${G[i].bold(logo[i])}`);
    await delay(60);
  }

  console.log();
  await typeLine(`    ${accentBold('CLIC')} ${chalk.dim('v4.2')} ${chalk.dim('·')} ${chalk.white('Command Line Intelligence Companion')}`, 10);
  console.log(`    ${chalk.dim('Powered by SAP AI Core & Multi-Model Orchestration and Agentic Planning')}`);
  console.log();

  // ── Tools panel (animated row-by-row) ──
  console.log(boxTop());
  console.log(boxLine(`${accentBold('⚡ Tools')}`));
  console.log(boxDiv());

  const tools: [string, string, string][] = [
    ['💬', 'chat',       'Conversational Q&A on any topic'],
    ['⚙️',  'command',    'Execute shell commands with approval'],
    ['📖', 'read',       'Read and analyze file contents'],
    ['✏️',  'write',      'Create or overwrite files'],
    ['➕', 'append',     'Append content to existing files'],
    ['🔧', 'modify',     'Find-and-replace within files'],
    ['📂', 'list',       'Browse directory contents'],
    ['🔍', 'search',     'Glob-based file search'],
    ['🌐', 'web',        'Search and scrape from the web'],
    ['🔗', 'agentic',    'Auto-chain: plan → act → verify'],
    ['📚', 'knowledge',  'Load role/behavior from a file'],
  ];

  for (const [icon, name, desc] of tools) {
    const label = accent(name.padEnd(13));
    console.log(boxLine(`  ${icon} ${label}${chalk.dim(desc)}`));
    await delay(30);
  }

  console.log(boxBottom());
  console.log();

  // ── Hints ──
  console.log(`    ${chalk.dim('Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`);
  console.log(`    ${chalk.dim('Commands:')} ${chalk.dim('/exit · /clear · /history · /status · /help · /raw')}`);
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
    ['/exit',    'Quit the agent'],
    ['/clear',   'Clear chat history'],
    ['/history', 'Show conversation history'],
    ['/status',  'Show system info'],
    ['/raw',     'Toggle raw JSON debug output'],
    ['/help',    'Show this menu'],
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
