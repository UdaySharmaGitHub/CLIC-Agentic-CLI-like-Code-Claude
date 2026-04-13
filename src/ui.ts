// ─────────────────────────────────────────────────────────────────────────────
//  UI — banner, colors, formatters
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';

export function printBanner(): void {
  console.clear();
  console.log();
  console.log(chalk.bold.white(`   ██████╗██╗     ██╗ ██████╗`));
  console.log(chalk.bold.white(`  ██╔════╝██║     ██║██╔════╝`));
  console.log(chalk.bold.white(`  ██║     ██║     ██║██║     `));
  console.log(chalk.bold.white(`  ██║     ██║     ██║██║     `));
  console.log(chalk.bold.white(`  ╚██████╗███████╗██║╚██████╗`));
  console.log(chalk.bold.white(`   ╚═════╝╚══════╝╚═╝ ╚═════╝`));
  console.log();
  console.log(`  ${chalk.cyan.bold('CLIC')} ${chalk.dim('v4.2')}  ${chalk.dim('—')}  ${chalk.white('Command Line Intelligence Companion')}`);
  console.log(`  ${chalk.dim('Powered by Google Gemini 2.5 Flash')}`);
  console.log();
  console.log(`  ${chalk.blue.bold('🧠 Capabilities:')}`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log(`  ${chalk.white('  💬 Chat / Q&A')}       │  Any topic — code, math, devops, science`);
  console.log(`  ${chalk.white('  ⚙️  Run Commands')}     │  Execute safe shell commands`);
  console.log(`  ${chalk.white('  📖 Read Files')}        │  Read and analyze file contents`);
  console.log(`  ${chalk.white('  ✏️  Write Files')}      │  Create or overwrite files`);
  console.log(`  ${chalk.white('  ➕ Append Files')}      │  Add content to existing files`);
  console.log(`  ${chalk.white('  🔧 Modify Files')}      │  Find-and-replace text in files`);
  console.log(`  ${chalk.white('  📂 List Dirs')}         │  Browse directory listings`);
  console.log(`  ${chalk.white('  🔍 Search Files')}      │  Glob-based file search`);
  console.log(`  ${chalk.white('  🔗 Agentic Loop')}      │  Auto-chain: plan → execute → verify`);
  console.log(`  ${chalk.white('  📚 Knowledge Base')}    │  Load role/behavior from a file`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log();
  console.log(`  ${chalk.green.bold('Tools:')} ${chalk.dim('chat · commands · read · write · append · modify · list · search · knowledge base')}`);
  console.log();
  console.log(`  ${chalk.yellow.bold('Commands:')} ${chalk.dim('/exit · /clear · /history · /status · /help · /raw')}`);
  console.log();
}

export function printHelp(): void {
  console.log();
  console.log(`  ${chalk.blue.bold('🧠 Capabilities:')}`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log(`  ${chalk.white('  💬 Chat / Q&A')}       │  Any topic`);
  console.log(`  ${chalk.white('  ⚙️  Run Commands')}     │  Safe shell commands with approval`);
  console.log(`  ${chalk.white('  📖 Read Files')}        │  Read and analyze file contents`);
  console.log(`  ${chalk.white('  ✏️  Write Files')}      │  Create or overwrite files`);
  console.log(`  ${chalk.white('  ➕ Append Files')}      │  Add content to existing files`);
  console.log(`  ${chalk.white('  🔧 Modify Files')}      │  Find-and-replace text in files`);
  console.log(`  ${chalk.white('  📂 List Dirs')}         │  Browse directory listings`);
  console.log(`  ${chalk.white('  🔍 Search Files')}      │  Glob-based file search`);
  console.log(`  ${chalk.white('  🔗 Agentic Loop')}      │  Auto-chains steps until task done`);
  console.log(`  ${chalk.white('  📚 Knowledge Base')}    │  Role/behavior loaded from file`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log();
  console.log(`  ${chalk.yellow.bold('⚡ CLI Commands:')}`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log(`  ${chalk.magenta('  /exit')}      │  Quit the agent`);
  console.log(`  ${chalk.magenta('  /clear')}     │  Clear chat history`);
  console.log(`  ${chalk.magenta('  /history')}   │  Show conversation history`);
  console.log(`  ${chalk.magenta('  /status')}    │  Show system info`);
  console.log(`  ${chalk.magenta('  /raw')}       │  Toggle raw JSON debug output`);
  console.log(`  ${chalk.magenta('  /help')}      │  Show this menu`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log();
  console.log(`  ${chalk.blue.bold('💡 Example prompts:')}`);
  console.log(`  ${chalk.dim('  • "what is the difference between TCP and UDP?"')}`);
  console.log(`  ${chalk.dim('  • "list all python files in current directory"')}`);
  console.log(`  ${chalk.dim('  • "create a test.py with a bug then fix it"          ← multi-step')}`);
  console.log(`  ${chalk.dim('  • "read config.json and update the port to 9000"     ← multi-step')}`);
  console.log(`  ${chalk.dim('  • "create a hello.sh, make it executable, run it"    ← multi-step')}`);
  console.log();
}

export function printStatus(opts: {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
}): void {
  console.log();
  console.log(`  ${chalk.cyan.bold('📊 System Context:')}`);
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log(`  ${chalk.white('  OS')}        │  ${os.type()} (${os.arch()})`);
  console.log(`  ${chalk.white('  User')}      │  ${os.userInfo().username}@${os.hostname()}`);
  console.log(`  ${chalk.white('  Shell')}     │  ${path.basename(process.env.SHELL || 'unknown')}`);
  console.log(`  ${chalk.white('  CWD')}       │  ${process.cwd()}`);
  console.log(`  ${chalk.white('  Date')}      │  ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`);
  console.log(`  ${chalk.white('  Model')}     │  ${opts.model}`);
  console.log(`  ${chalk.white('  History')}   │  ${opts.messageCount} messages`);
  console.log(`  ${chalk.white('  Max Steps')} │  ${opts.maxSteps} per user turn`);
  console.log(`  ${chalk.white('  Debug Raw')} │  ${opts.showRaw}`);
  if (opts.kbFile) {
    console.log(`  ${chalk.white('  KB Role')}   │  ${chalk.green('Loaded')} (from ${opts.kbFile})`);
  } else {
    console.log(`  ${chalk.white('  KB Role')}   │  ${chalk.dim('Not loaded (generic assistant)')}`);
  }
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
  console.log();
}

export function actionLabel(action: string): string {
  switch (action) {
    case 'run_command':    return chalk.yellow('⚙️  COMMAND');
    case 'read_file':      return chalk.blue('📖 READ FILE');
    case 'write_file':     return chalk.magenta('✏️  WRITE FILE');
    case 'append_file':    return chalk.magenta('➕ APPEND FILE');
    case 'modify_file':    return chalk.cyan('🔧 MODIFY FILE');
    case 'list_directory':  return chalk.blue('📂 LIST DIR');
    case 'search_files':   return chalk.cyan('🔍 SEARCH FILES');
    case 'web_search':     return chalk.cyan('🌐 WEB SEARCH');
    default:               return chalk.dim(`❓ ${action}`);
  }
}

export function printSeparator(): void {
  console.log(`  ${chalk.green('──────────────────────────────────────────────────────────')}`);
}

export function printToolHeader(toolName: string, detail: string): void {
  console.log();
  console.log(`  ${chalk.bold(`  [${actionLabel(toolName)}]`)}`);
  console.log(`  ${chalk.dim(`  📝 ${detail}`)}`);
  printSeparator();
}

export function printToolSuccess(message: string): void {
  console.log(`  ${chalk.green(`  ✅ ${message}`)}`);
}

export function printToolError(message: string): void {
  console.log(`  ${chalk.red(`  ❌ ${message}`)}`);
}

export function printToolBlocked(message: string): void {
  console.log(`  ${chalk.red(`  🚫 BLOCKED — ${message}`)}`);
}

export function printRejected(): void {
  console.log(`  ${chalk.red('  ❌ Rejected by user.')}`);
}

export function printDimOutput(lines: string[], maxLines = 50): void {
  const arr = lines.slice(0, maxLines);
  for (const line of arr) {
    console.log(`  ${chalk.dim(`  ${line}`)}`);
  }
  if (lines.length > maxLines) {
    console.log(`  ${chalk.dim(`  ... (output truncated: ${lines.length} lines total)`)}`);
  }
}
