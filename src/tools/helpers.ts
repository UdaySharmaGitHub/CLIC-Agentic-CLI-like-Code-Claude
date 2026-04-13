// ─────────────────────────────────────────────────────────────────────────────
//  Tools — shared helpers (path resolution)
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';

export function resolvePath(filepath: string): string {
  if (filepath.startsWith('~')) {
    return path.join(process.env.HOME || '/', filepath.slice(1));
  }
  return path.resolve(filepath);
}
