import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { W } from '../theme.js';

interface StepHeaderProps {
  step: number;
  maxSteps: number;
}

export function StepHeader({ step, maxSteps }: StepHeaderProps) {
  const badge = chalk.bgHex('#0d2137').hex('#60E1F0').bold(` ⟳ Step ${step} / ${maxSteps} `);
  const trail = chalk.dim('─'.repeat(W - 10));
  return (
    <>
      <Text>{''}</Text>
      <Text>{`  ${badge}  ${trail}`}</Text>
    </>
  );
}
