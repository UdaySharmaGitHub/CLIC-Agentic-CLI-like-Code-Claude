import { useRef } from 'react';

export interface HistoryState {
  push(entry: string): void;
  up(): string | null;
  down(): string | null;
}

export function createHistoryState(maxEntries = 50): HistoryState {
  const entries: string[] = [];
  let index = -1;

  function push(entry: string): void {
    if (!entry.trim()) return;
    const deduped = entries.filter(e => e !== entry);
    deduped.unshift(entry);
    entries.length = 0;
    entries.push(...deduped.slice(0, maxEntries));
    index = -1;
  }

  function up(): string | null {
    if (entries.length === 0) return null;
    index = Math.min(index + 1, entries.length - 1);
    return entries[index] ?? null;
  }

  function down(): string | null {
    index = Math.max(index - 1, -1);
    return index === -1 ? null : (entries[index] ?? null);
  }

  return { push, up, down };
}

export function useHistory(maxEntries = 50): HistoryState {
  const ref = useRef<HistoryState | null>(null);
  if (ref.current === null) {
    ref.current = createHistoryState(maxEntries);
  }
  return ref.current;
}
