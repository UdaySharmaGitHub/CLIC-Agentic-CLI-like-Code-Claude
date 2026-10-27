import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';
import { accent, accentBold } from '../theme.js';
import { visLen, boxTop, boxBottom, boxDiv, boxLine } from '../helpers.js';

export function Help() {
  const W2 = 73;
  const LW = 34;

  const box2Top    = () => chalk.dim(`  ╭${'─'.repeat(36)}┬${'─'.repeat(38)}╮`);
  const box2Div    = () => chalk.dim(`  ├${'─'.repeat(36)}┼${'─'.repeat(38)}┤`);
  const box2Bottom = () => chalk.dim(`  ╰${'─'.repeat(36)}┴${'─'.repeat(38)}╯`);

  const splitRow = (left: string, right: string) => {
    const lpad = ' '.repeat(Math.max(0, LW - visLen(left)));
    return boxLine(`${left}${lpad}${chalk.dim(' │ ')}${right}`, W2);
  };

  const capCat  = (lbl: string) => `  ${chalk.hex('#818CF8')('┄')}  ${chalk.hex('#A78BFA').bold(lbl)}`;
  const capItem = (icon: string, name: string) => `  ${icon} ${chalk.white(name)}`;
  const cmdCat  = (lbl: string) => `  ${chalk.hex('#F59E0B')('┄')}  ${chalk.hex('#FCD34D').bold(lbl)}`;
  const cmdItem = (cmd: string, desc: string) => `  ${accent(cmd.padEnd(10))}${chalk.dim(desc)}`;
  const cmdSub  = (sub: string, desc: string) => `    ${chalk.dim('·')} ${chalk.dim(sub.padEnd(8))}${chalk.dim(desc)}`;

  const L: string[] = [
    capCat('Conversation'),
    capItem('💬', 'Chat / Q&A'),
    capItem('🔗', 'Agentic Loop'),
    capItem('📚', 'Knowledge Base'),
    '',
    capCat('Files & Filesystem'),
    capItem('📖', 'Read'),
    capItem('✏️',  'Write'),
    capItem('➕', 'Append'),
    capItem('🔧', 'Modify'),
    capItem('📂', 'List Dirs'),
    '',
    capCat('External'),
    capItem('⚙️',  'Run Commands'),
    capItem('🔍', 'Search'),
    capItem('🌐', 'Web Search'),
    '',
  ];

  const R: string[] = [
    cmdCat('Session'),
    cmdItem('/session',  'Named sessions  /s'),
    cmdSub('new',    'create & switch'),
    cmdSub('switch', 'switch to session'),
    cmdSub('rename', 'rename active'),
    cmdSub('list',   'list all sessions'),
    cmdSub('delete', 'delete a session'),
    cmdItem('/compact',  'Summarize history'),
    cmdItem('/clear',    'Clear chat'),
    cmdItem('/undo',     'Remove last exchange'),
    cmdItem('/retry',    'Regenerate  /r'),
    cmdItem('/exit',     'Quit'),
    '',
    cmdCat('Configuration'),
    cmdItem('/model',    'Switch model'),
    cmdItem('/role',     'Switch persona'),
    '',
    cmdCat('Information'),
    cmdItem('/tokens',   'Token usage'),
    cmdItem('/status',   'System info'),
    cmdItem('/history',  'Show history'),
    cmdItem('/raw',      'Debug output'),
    cmdItem('/help',     'Show this menu'),
  ];

  const ideas: [string, string][] = [
    ['①', 'what is the difference between TCP and UDP?'],
    ['②', 'list all python files in current directory'],
    ['③', 'create a test.py with a bug then fix it'],
    ['④', 'read config.json and update the port to 9000'],
    ['⑤', 'create a hello.sh, make it executable, run it'],
  ];

  const maxLen = Math.max(L.length, R.length);

  return (
    <>
      <Text>{''}</Text>
      <Text>{box2Top()}</Text>
      <Text>{splitRow(accentBold('🧠 Capabilities'), chalk.yellow.bold('⌘  Commands'))}</Text>
      <Text>{box2Div()}</Text>
      {Array.from({ length: maxLen }, (_, i) => (
        <Text key={i}>{splitRow(L[i] ?? '', R[i] ?? '')}</Text>
      ))}
      <Text>{box2Bottom()}</Text>
      <Text>{''}</Text>
      <Text>{boxTop()}</Text>
      <Text>{boxLine(`${accentBold('💡 Prompt Ideas')}`)}</Text>
      <Text>{boxDiv()}</Text>
      {ideas.map(([num, idea], i) => (
        <Text key={i}>{boxLine(`  ${accent(num)}  ${chalk.dim(`"${idea}"`)}`)}</Text>
      ))}
      <Text>{boxBottom()}</Text>
      <Text>{''}</Text>
    </>
  );
}
