import chalk from 'chalk';

export const W = 62; // inner content width

export const accent     = chalk.hex('#60E1F0');
export const accentBold = chalk.hex('#60E1F0').bold;

export const LOGO_COLORS = ['#C084FC', '#A78BFA', '#818CF8', '#60A5FA', '#38BDF8', '#22D3EE'];

export const SESSION_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#7C3AED', fg: '#FFFFFF' }, // violet
  { bg: '#DC2626', fg: '#FFFFFF' }, // red
  { bg: '#059669', fg: '#FFFFFF' }, // emerald
  { bg: '#2563EB', fg: '#FFFFFF' }, // blue
  { bg: '#D97706', fg: '#000000' }, // amber
  { bg: '#0891B2', fg: '#FFFFFF' }, // cyan
  { bg: '#DB2777', fg: '#FFFFFF' }, // pink
  { bg: '#65A30D', fg: '#FFFFFF' }, // lime
  { bg: '#EA580C', fg: '#FFFFFF' }, // orange
  { bg: '#0D9488', fg: '#FFFFFF' }, // teal
];

export const ACTION_STYLES: Record<string, { icon: string; color: (s: string) => string }> = {
  run_command:    { icon: '⚙️ ', color: chalk.yellow },
  read_file:      { icon: '📖', color: chalk.hex('#60E1F0') },
  write_file:     { icon: '✏️ ', color: chalk.hex('#C084FC') },
  append_file:    { icon: '➕', color: chalk.hex('#C084FC') },
  modify_file:    { icon: '🔧', color: chalk.hex('#F59E0B') },
  list_directory: { icon: '📂', color: chalk.hex('#60E1F0') },
  search_files:   { icon: '🔍', color: chalk.hex('#34D399') },
  web_search:     { icon: '🌐', color: chalk.hex('#34D399') },
};
