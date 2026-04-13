// ─────────────────────────────────────────────────────────────────────────────
//  Safety — blocked commands & protected paths
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_PATTERNS: string[] = [
  'rm -rf /',    'rm -rf /*',   'mkfs',         'dd if=',
  ':(){:|:&};:', 'fork bomb',   '> /dev/sda',
  'chmod -R 777 /', 'chown -R',  'shutdown',
  'reboot',      'halt',        'init 0',       'init 6',
  'kill -9 1',   'mv /* ',
  'curl.*| bash', 'curl.*| sh', 'wget.*| bash',
  'poweroff',
];

const PROTECTED_PATHS: string[] = [
  '/etc/passwd', '/etc/shadow', '/etc/sudoers',
  '/etc/hosts',  '/boot/',      '/dev/',
  '/proc/',      '/sys/',       '/var/log/auth',
];

export function isCommandSafe(cmd: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (cmd.includes(pattern)) {
      return { safe: false, reason: `Blocked pattern: "${pattern}"` };
    }
  }
  return { safe: true };
}

export function isPathSafe(filepath: string): { safe: boolean; reason?: string } {
  for (const pattern of PROTECTED_PATHS) {
    if (filepath.startsWith(pattern)) {
      return { safe: false, reason: `Protected path: "${pattern}"` };
    }
  }
  return { safe: true };
}
