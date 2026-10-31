import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface ContextBarProps {
  promptTokens: number;
  contextLimit: number;
  threshold?: number;
}

export function ContextBar({ promptTokens, contextLimit, threshold = 0.80 }: ContextBarProps) {
  if (promptTokens <= 0 || contextLimit <= 0) return null;

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

  return <Text>{`  ${prefix} ${chalk.dim('Context')}  ${chalk.dim('[')}${bar}${chalk.dim(']')}  ${label}  ${detail}`}</Text>;
}
