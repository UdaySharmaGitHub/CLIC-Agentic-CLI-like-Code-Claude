import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

type ResultType = 'success' | 'error' | 'blocked' | 'rejected';

interface ToolResultProps {
  type: ResultType;
  message?: string;
}

export function ToolResult({ type, message }: ToolResultProps) {
  switch (type) {
    case 'success':
      return <Text>{`  ${chalk.green('✅')} ${chalk.green(message ?? '')}`}</Text>;
    case 'error':
      return <Text>{`  ${chalk.red('❌')} ${chalk.red(message ?? '')}`}</Text>;
    case 'blocked':
      return <Text>{`  ${chalk.bgRed.white.bold(' 🚫 BLOCKED ')} ${chalk.red(message ?? '')}`}</Text>;
    case 'rejected':
      return <Text>{`  ${chalk.red('❌')} ${chalk.dim('Rejected by user.')}`}</Text>;
  }
}
