import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import os from 'node:os';
import path from 'node:path';
import { accentBold } from '../theme.js';
import { boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

interface StatusProps {
  messageCount: number;
  maxSteps: number;
  showRaw: boolean;
  kbFile?: string;
  model: string;
  contextLimit: number;
  sessionName?: string;
}

export function Status({ messageCount, maxSteps, showRaw, kbFile, model, contextLimit, sessionName }: StatusProps) {
  const rows: [string, string][] = [
    ['🖥  OS',          `${os.type()} (${os.arch()})`],
    ['👤 User',        `${os.userInfo().username}@${os.hostname()}`],
    ['🐚 Shell',       path.basename(process.env.SHELL || 'unknown')],
    ['📁 CWD',         process.cwd()],
    ['📅 Date',        new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['🔖 Session',     sessionName ?? chalk.dim('default')],
    ['🤖 Model',       model],
    ['🪟 Context Win', `${contextLimit.toLocaleString()} tokens`],
    ['💬 History',     `${messageCount} messages`],
    ['🔄 Max Steps',   `${maxSteps} per turn`],
    ['🐛 Debug Raw',   showRaw ? chalk.yellow('on') : chalk.dim('off')],
    ['📚 KB Role',     kbFile ? `${chalk.green('● Loaded')} ${chalk.dim(`(${kbFile})`)}` : chalk.dim('not loaded')],
  ];

  return (
    <>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(`${accentBold('📊 System Context')}`)}</Text>
      <Text>{boxDiv()}</Text>
      {rows.map(([key, val], i) => (
        <Text key={i}>{boxLine(`  ${chalk.dim(key.padEnd(14))}${val}`)}</Text>
      ))}
      <Text>{boxBottom()}</Text>
      <Text>{''}</Text>
    </>
  );
}
