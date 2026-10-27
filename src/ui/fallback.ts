// Non-TTY fallback — chalk-based implementations used when process.stdout.isTTY is false
// (--paste mode, piped stdin, CI). Ink cannot render without a real TTY.

import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';
import { W, accent, accentBold, LOGO_COLORS } from './theme.js';
import { visLen, logoGradient, boxTop, boxBottom, boxDiv, boxLine, actionLabel, sessionNameBadge } from './helpers.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  const maxLogoLen = Math.max(...logo.map((l) => l.length));
  const termWidth  = process.stdout.columns || 80;
  const logoPad    = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));
  const gradedLogo = logoGradient(logo);
  for (const line of gradedLogo) {
    console.log(`${logoPad}${line}`);
    await delay(80);
  }

  console.log();

  const divider  = chalk.dim('─'.repeat(18));
  const star     = chalk.hex('#C084FC')('✦');
  const title    = chalk.bold.white('Command Line Intelligence Companion');
  const tagline  = `${divider} ${star} ${title} ${star} ${divider}`;
  const taglinePad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(tagline)) / 2)));
  console.log(`${taglinePad}${tagline}`);
  console.log();

  const sep  = chalk.dim(' · ');
  const info =
    `${chalk.hex('#C084FC').bold('v4.3')}${sep}` +
    `${chalk.dim('Anthropic & OpenAI & Google')}${sep}` +
    `${chalk.hex('#22D3EE')('Multi-Model Orchestration')}${sep}` +
    `${chalk.hex('#34D399').bold('● Ready')}`;
  const infoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(info)) / 2)));
  console.log(`${infoPad}${info}`);
  console.log();

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

  console.log(`    ${chalk.dim('▸ Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`);
  console.log(`    ${chalk.dim('▸ /compact · /model · /role · /undo · /retry · /tokens · /clear · /exit')}`);
  console.log();
}

export function printHelp(): void {
  console.log();

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
  const cmdSub  = (sub: string, desc: string) => `    ${chalk.dim('·')} ${chalk.dim(sub.padEnd(8))}${chalk.dim(desc)}`;

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

  const R: string[] = [
    cmdCat('Session'),
    cmdItem('/session',  'Named sessions  /s'),
    cmdSub('new',    'create & switch'),
    cmdSub('switch', 'switch to session'),
    cmdSub('rename', 'rename active'),
    cmdSub('list',   'list all sessions'),
    cmdSub('delete', 'delete a session'),
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

  console.log(box2Top());
  console.log(splitRow(accentBold('🧠 Capabilities'), chalk.yellow.bold('⌘  Commands')));
  console.log(box2Div());

  const maxLen = Math.max(L.length, R.length);
  for (let i = 0; i < maxLen; i++) {
    console.log(splitRow(L[i] ?? '', R[i] ?? ''));
  }

  console.log(box2Bottom());
  console.log();

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

export function printStatus(opts: {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
  contextLimit: number;
  sessionName?: string;
}): void {
  console.log();
  console.log(boxTop());
  console.log(boxLine(`${accentBold('📊 System Context')}`));
  console.log(boxDiv());

  const rows: [string, string][] = [
    ['🖥  OS',          `${os.type()} (${os.arch()})`],
    ['👤 User',        `${os.userInfo().username}@${os.hostname()}`],
    ['🐚 Shell',       path.basename(process.env.SHELL || 'unknown')],
    ['📁 CWD',         process.cwd()],
    ['📅 Date',        new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['🔖 Session',     opts.sessionName ?? chalk.dim('default')],
    ['🤖 Model',       opts.model],
    ['🪟 Context Win', `${opts.contextLimit.toLocaleString()} tokens`],
    ['💬 History',     `${opts.messageCount} messages`],
    ['🔄 Max Steps',   `${opts.maxSteps} per turn`],
    ['🐛 Debug Raw',   opts.showRaw ? chalk.yellow('on') : chalk.dim('off')],
    ['📚 KB Role',     opts.kbFile ? `${chalk.green('● Loaded')} ${chalk.dim(`(${opts.kbFile})`)}` : chalk.dim('not loaded')],
  ];

  for (const [key, val] of rows) {
    console.log(boxLine(`  ${chalk.dim(key.padEnd(14))}${val}`));
  }

  console.log(boxBottom());
  console.log();
}

export function printStepHeader(step: number, maxSteps: number): void {
  console.log();
  const badge = chalk.bgHex('#0d2137').hex('#60E1F0').bold(` ⟳ Step ${step} / ${maxSteps} `);
  const trail = chalk.dim('─'.repeat(W - 10));
  console.log(`  ${badge}  ${trail}`);
}

export function printSeparator(): void {
  console.log(chalk.dim(`  ${'─'.repeat(W + 4)}`));
}

export function promptPrintSeperator(sessionName?: string): void {
  const termWidth = process.stdout.columns || 80;
  const badge = sessionName ? ` ${sessionNameBadge(sessionName)}` : '';
  const badgeVisLen = sessionName ? sessionName.length + 2 : 0;
  const dashCount = Math.max(4, termWidth - badgeVisLen - 2);
  const dashes = chalk.cyanBright('─'.repeat(dashCount));
  console.log(`  ${dashes}${badge}`);
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

export function printContextBar(promptTokens: number, contextLimit: number, threshold = 0.80): void {
  if (promptTokens <= 0 || contextLimit <= 0) return;

  const pct    = promptTokens / contextLimit;
  const pctInt = Math.round(pct * 100);
  const BAR_W  = 30;
  const filled = Math.min(BAR_W, Math.round(pct * BAR_W));
  const empty  = BAR_W - filled;

  let barColor: (s: string) => string;
  let pctColor: (s: string) => string;
  if (pct < 0.60)           { barColor = chalk.green;  pctColor = chalk.green.bold;  }
  else if (pct < threshold) { barColor = chalk.yellow; pctColor = chalk.yellow.bold; }
  else                      { barColor = chalk.red;    pctColor = chalk.red.bold;    }

  const bar    = barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const label  = pctColor(`${pctInt}%`);
  const detail = chalk.dim(`${promptTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens`);
  const prefix = pct >= threshold ? chalk.red('🔴') : pct >= 0.60 ? chalk.yellow('🟡') : chalk.green('🟢');

  console.log(`  ${prefix} ${chalk.dim('Context')}  ${chalk.dim('[')}${bar}${chalk.dim(']')}  ${label}  ${detail}`);
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

export { sessionNameBadge };
