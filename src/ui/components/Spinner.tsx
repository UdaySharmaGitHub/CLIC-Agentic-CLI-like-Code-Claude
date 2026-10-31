import React from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';
import chalk from 'chalk';

export function ThinkingSpinner() {
  return (
    <Text>
      {'  '}
      <InkSpinner type="dots" />
      {chalk.dim(' Thinking...')}
    </Text>
  );
}
