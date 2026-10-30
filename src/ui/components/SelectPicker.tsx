import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { accent } from '../theme.js';
import type { SelectItem } from '../helpers.js';
import { selectInitialIndex } from '../helpers.js';

export interface SelectPickerProps<T> {
  message: string;
  items: SelectItem<T>[];
  initialValue?: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
}

export function SelectPicker<T>({ message, items, initialValue, onSelect, onCancel }: SelectPickerProps<T>) {
  const [index, setIndex] = useState(() => selectInitialIndex(items, initialValue));

  useInput((input, key) => {
    if (key.upArrow) setIndex(i => (i === 0 ? items.length - 1 : i - 1));
    else if (key.downArrow) setIndex(i => (i === items.length - 1 ? 0 : i + 1));
    else if (key.return) onSelect(items[index]!.value);
    else if (key.escape || (key.ctrl && input === 'c')) onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text>{accent('  ? ') + chalk.bold(message)}</Text>
      {items.map((item, i) => {
        const selected = i === index;
        const cursor = selected ? accent('❯') : ' ';
        const label = selected ? accent(item.label) : item.label;
        const hint = item.hint ? chalk.dim(`  ${item.hint}`) : '';
        return <Text key={i}>{`  ${cursor} ${label}${hint}`}</Text>;
      })}
    </Box>
  );
}
