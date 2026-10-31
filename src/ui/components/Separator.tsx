import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { W } from '../theme.js';
import { sessionNameBadge } from '../helpers.js';

export function Separator() {
  return <Text>{chalk.dim(`  ${'─'.repeat(W + 4)}`)}</Text>;
}

export function PromptSeparator({ sessionName }: { sessionName?: string }) {
  const termWidth = process.stdout.columns || 80;
  const badge = sessionName ? ` ${sessionNameBadge(sessionName)}` : '';
  const badgeVisLen = sessionName ? sessionName.length + 2 : 0;
  const dashCount = Math.max(4, termWidth - badgeVisLen - 2);
  const dashes = chalk.cyanBright('─'.repeat(dashCount));
  return <Text>{`  ${dashes}${badge}`}</Text>;
}
