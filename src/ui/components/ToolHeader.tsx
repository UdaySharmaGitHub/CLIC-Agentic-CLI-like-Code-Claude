import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { boxTop, boxBottom, boxDiv, boxLine, actionLabel } from '../helpers.js';

interface ToolHeaderProps {
  toolName: string;
  detail: string;
}

export function ToolHeader({ toolName, detail }: ToolHeaderProps) {
  return (
    <>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(chalk.bold(actionLabel(toolName)))}</Text>
      <Text>{boxDiv()}</Text>
      <Text>{boxLine(`📝 ${chalk.dim(detail)}`)}</Text>
      <Text>{boxBottom()}</Text>
    </>
  );
}
