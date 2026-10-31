import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { accent } from '../theme.js';

export interface TextPromptProps {
  message: string;
  placeholder?: string;
  mask?: string;
  validate?: (value: string) => string | undefined;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextPrompt({ message, placeholder, mask, validate, onSubmit, onCancel }: TextPromptProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) { onCancel(); return; }
    if (key.return) {
      const err = validate?.(value);
      if (err) { setError(err); return; }
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) { setValue(v => v.slice(0, -1)); setError(undefined); return; }
    if (input && !key.ctrl && !key.meta) { setValue(v => v + input); setError(undefined); }
  });

  const shown = value.length === 0
    ? chalk.dim(placeholder ?? '')
    : (mask ? mask.repeat(value.length) : value);

  return (
    <Box flexDirection="column">
      <Text>{accent('  ? ') + chalk.bold(message) + ' ' + shown + accent('▏')}</Text>
      {error ? <Text>{chalk.red(`    ${error}`)}</Text> : null}
    </Box>
  );
}
