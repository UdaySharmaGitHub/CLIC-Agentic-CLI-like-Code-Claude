import React, { useEffect, useState } from 'react';
import { Text, useApp } from 'ink';
import chalk from 'chalk';
import { accentBold, accent } from '../theme.js';
import { logoGradient, visLen, boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

const LOGO_LINES = [
  '  ██████╗ ██╗      ██╗  ██████╗ ',
  ' ██╔════╝ ██║      ██║ ██╔════╝ ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ██║      ██║      ██║ ██║      ',
  ' ╚██████╗ ███████╗ ██║ ╚██████╗ ',
  '  ╚═════╝ ╚══════╝ ╚═╝  ╚═════╝ ',
];

const TOOLS: [string, string][] = [
  ['💬', 'chat'],      ['⚙️ ', 'command'],   ['📖', 'read'],
  ['✏️ ', 'write'],    ['➕',  'append'],     ['🔧', 'modify'],
  ['📂', 'list'],      ['🔍', 'search'],      ['🌐', 'web'],
  ['🔗', 'agentic'],   ['📚', 'knowledge'],
];

interface BannerProps {
  instantMode?: boolean; // skip delays — for testing
}

export function Banner({ instantMode = false }: BannerProps) {
  const { exit } = useApp();
  const gradedLines = logoGradient(LOGO_LINES);
  const termWidth = process.stdout.columns || 80;
  const maxLogoLen = Math.max(...LOGO_LINES.map((l) => l.length));
  const logoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - maxLogoLen) / 2)));

  const totalLines = LOGO_LINES.length + TOOLS.length;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (instantMode) {
      setStep(totalLines);
      return;
    }

    let count = 0;
    const id = setInterval(() => {
      count++;
      setStep(count);
      if (count >= totalLines) clearInterval(id);
    }, count < LOGO_LINES.length ? 80 : 25);
    return () => clearInterval(id);
  }, [instantMode]);

  // Signal parent adapter when animation is complete
  useEffect(() => {
    if (step >= totalLines) exit();
  }, [step, totalLines, exit]);

  const divider    = chalk.dim('─'.repeat(18));
  const star       = chalk.hex('#C084FC')('✦');
  const title      = chalk.bold.white('Command Line Intelligence Companion');
  const tagline    = `${divider} ${star} ${title} ${star} ${divider}`;
  const taglinePad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(tagline)) / 2)));

  const sep  = chalk.dim(' · ');
  const info =
    `${chalk.hex('#C084FC').bold('v4.3')}${sep}` +
    `${chalk.dim('Anthropic & OpenAI & Google')}${sep}` +
    `${chalk.hex('#22D3EE')('Multi-Model Orchestration')}${sep}` +
    `${chalk.hex('#34D399').bold('● Ready')}`;
  const infoPad = ' '.repeat(Math.max(0, Math.floor((termWidth - visLen(info)) / 2)));

  const NAME_W = 10;
  const toolRows: string[][] = [];
  for (let i = 0; i < TOOLS.length; i += 3) {
    const row = TOOLS.slice(i, i + 3) as [string, string][];
    const cells = row.map(([icon, name]) =>
      `${icon} ${accent(name)}${' '.repeat(Math.max(0, NAME_W - name.trim().length))}`,
    );
    while (cells.length < 3) cells.push(' '.repeat(NAME_W + 3));
    toolRows.push(cells);
  }

  const visibleLogoLines = gradedLines.slice(0, Math.min(step, LOGO_LINES.length));
  const visibleToolRows  = toolRows.slice(0, Math.max(0, step - LOGO_LINES.length));

  return (
    <>
      <Text>{''}</Text>
      {visibleLogoLines.map((line, i) => (
        <Text key={`logo-${i}`}>{`${logoPad}${line}`}</Text>
      ))}
      {step >= LOGO_LINES.length && (
        <>
          <Text>{''}</Text>
          <Text>{`${taglinePad}${tagline}`}</Text>
          <Text>{''}</Text>
          <Text>{`${infoPad}${info}`}</Text>
          <Text>{''}</Text>
          <Text>{boxTop()}</Text>
          <Text>{boxLine(`${accentBold('⚡ Tools & Capabilities')}`)}</Text>
          <Text>{boxDiv()}</Text>
          {visibleToolRows.map((cells, i) => (
            <Text key={`tool-${i}`}>{boxLine(`  ${cells.join('  ')}`)}</Text>
          ))}
          {step >= totalLines && (
            <>
              <Text>{boxBottom()}</Text>
              <Text>{''}</Text>
              <Text>{`    ${chalk.dim('▸ Type')} ${accent('/help')} ${chalk.dim('for commands,')} ${accent('/status')} ${chalk.dim('for system info, or just start chatting.')}`}</Text>
              <Text>{`    ${chalk.dim('▸ /compact · /model · /role · /undo · /retry · /tokens · /clear · /exit')}`}</Text>
              <Text>{''}</Text>
            </>
          )}
        </>
      )}
    </>
  );
}
