import React from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';

export interface ConfirmDialogProps {
  message: string;
  detail?: string;
  onConfirm: (accepted: boolean) => void;
}

export function ConfirmDialog({ message, detail, onConfirm }: ConfirmDialogProps) {
  useInput((input, key) => {
    const ch = input.toLowerCase();
    if (ch === 'y') onConfirm(true);
    else if (ch === 'n' || key.return || key.escape || (key.ctrl && input === 'c')) onConfirm(false);
  });

  return (
    <Box flexDirection="column">
      <Text>{`  ${chalk.yellow('▶')} ${message} ${chalk.dim('(y/N)')}`}</Text>
      {detail ? <Text>{chalk.dim(`    ${detail}`)}</Text> : null}
    </Box>
  );
}
