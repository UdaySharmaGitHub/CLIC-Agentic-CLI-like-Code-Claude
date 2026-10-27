import chalk from 'chalk';
import { W, LOGO_COLORS, SESSION_PALETTE, ACTION_STYLES } from './theme.js';

export function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function logoGradient(lines: string[]): string[] {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const maxDiag = (lines.length - 1) + (maxLen - 1);
  return lines.map((line, row) =>
    line.split('').map((ch, col) => {
      if (ch === ' ') return ch;
      const t = maxDiag === 0 ? 0 : (row + col) / maxDiag;
      const idx = Math.min(Math.floor(t * LOGO_COLORS.length), LOGO_COLORS.length - 1);
      return chalk.hex(LOGO_COLORS[idx]).bold(ch);
    }).join('')
  );
}

export function boxTop(w = W): string {
  return chalk.dim(`  ╭${'─'.repeat(w + 2)}╮`);
}

export function boxBottom(w = W): string {
  return chalk.dim(`  ╰${'─'.repeat(w + 2)}╯`);
}

export function boxDiv(w = W): string {
  return chalk.dim(`  ├${'─'.repeat(w + 2)}┤`);
}

export function boxLine(content: string, w = W): string {
  const pad = Math.max(0, w - visLen(content));
  return `  ${chalk.dim('│')} ${content}${' '.repeat(pad)} ${chalk.dim('│')}`;
}

export function sessionPaletteEntry(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return SESSION_PALETTE[hash % SESSION_PALETTE.length]!;
}

export function actionLabel(action: string): string {
  const style = ACTION_STYLES[action];
  if (!style) return chalk.dim(`❓ ${action}`);
  const name = action.replace(/_/g, ' ').toUpperCase();
  return style.color(`${style.icon} ${name}`);
}

export function sessionNameBadge(name: string): string {
  const { bg, fg } = sessionPaletteEntry(name);
  return chalk.hex(fg).bgHex(bg)(` ${name} `);
}
