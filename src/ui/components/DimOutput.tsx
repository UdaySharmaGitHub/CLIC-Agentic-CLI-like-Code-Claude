import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface DimOutputProps {
  lines: string[];
  maxLines?: number;
}

export function DimOutput({ lines, maxLines = 50 }: DimOutputProps) {
  const arr = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;
  return (
    <>
      {arr.map((line, i) => (
        <Text key={i}>{chalk.dim(`    ${line}`)}</Text>
      ))}
      {truncated && (
        <Text>{chalk.dim(`    ⋯ (${lines.length - maxLines} more lines truncated)`)}</Text>
      )}
    </>
  );
}
