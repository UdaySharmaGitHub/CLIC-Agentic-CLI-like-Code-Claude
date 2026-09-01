// ─────────────────────────────────────────────────────────────────────────────
//  TerminalManager — pool of persistent node-pty shells
//
//  Key design points:
//   • Each named terminal is an independent PTY running an interactive shell.
//     Shell state (cwd, env, venv) persists across exec() calls.
//   • Completion is detected via a unique sentinel appended after every command:
//       printf '__CLIC_END__<token>__%d__\n' "$?"
//     The exit code is embedded in the sentinel so $? is captured correctly.
//   • Commands on the SAME terminal are serialised via a per-terminal promise
//     queue (mutex). Commands on DIFFERENT terminals run in true parallel.
//   • Startup flush: spawn() waits 800ms for the shell to initialise, then
//     runs `true` to drain the welcome noise before marking the terminal idle.
// ─────────────────────────────────────────────────────────────────────────────

import pty from 'node-pty';
import type { IPty } from 'node-pty';
import crypto from 'node:crypto';
import {
  TERMINAL_SHELL,
  TERMINAL_MAX,
  TERMINAL_CMD_TIMEOUT_MS,
  TERMINAL_BUFFER_LINES,
} from './config.js';

// ── Pure helpers (exported so test/terminal.test.ts can unit-test them) ──────

/** Strip all VT/xterm escape sequences: CSI, OSC, DCS, SS2/SS3, bare ESC. */
export function stripAnsi(str: string): string {
  return str
    // OSC: ESC ] ... (terminated by BEL or ST = ESC \)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // CSI: ESC [ ... letter
    .replace(/\x1B\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, '')
    // DCS / APC / PM / SOS: ESC [P\X^_] ... ST
    .replace(/\x1B[P\\X^_][\s\S]*?(?:\x1B\\|\x07)/g, '')
    // Single-char ESC sequences (ESC + 0x40–0x5F: ESC M, ESC =, …)
    .replace(/\x1B[\x40-\x5F]/g, '')
    // Remaining bare ESC
    .replace(/\x1B/g, '')
    // Carriage returns
    .replace(/\r/g, '');
}

/** Fixed-size ring buffer that stores the last `maxLines` lines of PTY output. */
export class RingBuffer {
  private lines: string[] = [];
  private pending = '';

  constructor(private readonly maxLines: number) {}

  push(chunk: string): void {
    const parts = (this.pending + chunk).split('\n');
    this.pending = parts.pop() ?? '';
    for (const line of parts) {
      if (this.lines.length >= this.maxLines) this.lines.shift();
      this.lines.push(line);
    }
  }

  /** Return the last `n` lines joined by newline. */
  tail(n: number): string {
    return this.lines.slice(-n).join('\n');
  }

  clear(): void {
    this.lines = [];
    this.pending = '';
  }
}

/** Validate a terminal name: 1–32 chars, letters / digits / _ / -. */
export function assertValidTerminalName(name: string): void {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    throw new Error(
      `Invalid terminal name "${name}": use 1–32 chars (letters, digits, _ or -).`,
    );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TerminalStatus = 'idle' | 'running' | 'background' | 'killed';

export interface TerminalInfo {
  name: string;
  status: TerminalStatus;
  cwd: string;
  pid?: number;
  lastCommand?: string;
  createdAt: string;
}

export interface ExecResult {
  output: string;
  exitCode: number | null;   // null when timedOut
  timedOut: boolean;
  terminal: string;
}

// ── Defaults (from src/config.ts) ─────────────────────────────────────────────

const DEFAULTS = {
  shell:        TERMINAL_SHELL,
  maxTerminals: TERMINAL_MAX,
  cmdTimeoutMs: TERMINAL_CMD_TIMEOUT_MS,
  bufferLines:  TERMINAL_BUFFER_LINES,
};

// ── Internal entry (not exported) ─────────────────────────────────────────────

interface TerminalEntry {
  pty:         IPty;
  status:      TerminalStatus;
  buffer:      RingBuffer;
  cwd:         string;
  createdAt:   string;
  lastCommand?: string;
  // Per-terminal mutex: always resolves, never rejects.
  // Callers chain onto this to serialise exec() calls on the same terminal.
  queue:       Promise<unknown>;
}

// ── Output post-processing ────────────────────────────────────────────────────

/**
 * Clean raw PTY output for return to the LLM:
 *  - strip ANSI/VT escapes
 *  - remove the echoed command line, sentinel printf, sentinel marker
 *  - remove bare shell prompt lines (%, $, ❯, ➜, #)
 */
function processOutput(raw: string, command: string, token: string): string {
  const firstChunk = command.trimStart().slice(0, 18);
  return stripAnsi(raw)
    .split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (t.includes(`__CLIC_END__${token}`)) return false;
      if (t.startsWith(`printf '__CLIC_END__`)) return false;
      if (firstChunk && t.startsWith(firstChunk)) return false;
      // Bare shell prompts — zsh emits %, bash emits $, oh-my-zsh emits ❯ / ➜
      if (/^[%$❯→➜#]\s/.test(t) || t === '%' || t === '$' || t === '#') return false;
      return true;
    })
    .join('\n')
    .trim();
}

// ── TerminalManager ───────────────────────────────────────────────────────────

class TerminalManager {
  private readonly terminals    = new Map<string, TerminalEntry>();
  private readonly spawnLocks   = new Map<string, Promise<void>>();  // dedup concurrent spawns

  private readonly shell:        string;
  private readonly maxTerminals: number;
  private readonly cmdTimeoutMs: number;
  private readonly bufferLines:  number;

  constructor(opts: Partial<typeof DEFAULTS> = {}) {
    this.shell        = opts.shell        ?? DEFAULTS.shell;
    this.maxTerminals = opts.maxTerminals ?? DEFAULTS.maxTerminals;
    this.cmdTimeoutMs = opts.cmdTimeoutMs ?? DEFAULTS.cmdTimeoutMs;
    this.bufferLines  = opts.bufferLines  ?? DEFAULTS.bufferLines;
  }

  // ── Public: lifecycle ───────────────────────────────────────────────────────

  /** Spawn a new named terminal. Errors if the pool is full or name is taken. */
  async spawn(name: string, cwd?: string): Promise<void> {
    assertValidTerminalName(name);
    if (this.terminals.has(name)) throw new Error(`Terminal "${name}" already exists.`);
    if (this.terminals.size >= this.maxTerminals) {
      throw new Error(`Terminal pool is full (max ${this.maxTerminals}). Kill one first.`);
    }

    const workDir = cwd ?? process.cwd();
    const proc = pty.spawn(this.shell, [], {
      name: 'xterm-color',
      cols: 220,
      rows: 30,
      cwd: workDir,
      env: { ...process.env } as Record<string, string>,
    });

    const entry: TerminalEntry = {
      pty:       proc,
      status:    'idle',
      buffer:    new RingBuffer(this.bufferLines),
      cwd:       workDir,
      createdAt: new Date().toISOString(),
      queue:     Promise.resolve(),
    };

    // Persistent handler: all output flows into the ring buffer.
    proc.onData((data: string) => entry.buffer.push(data));

    this.terminals.set(name, entry);

    // Let the shell fully initialise before we start issuing commands.
    await new Promise<void>(r => setTimeout(r, 800));
    // Flush welcome noise (motd, .zshrc output, etc.)
    await this._execRaw(entry, name, 'true', 5_000).catch(() => {});
  }

  /** Destroy a terminal and remove it from the pool. */
  async kill(name: string): Promise<void> {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);
    entry.status = 'killed';
    try { entry.pty.kill(); } catch { /* already dead */ }
    this.terminals.delete(name);
  }

  /** Destroy all terminals. Called on every CLIC exit path. */
  async killAll(): Promise<void> {
    await Promise.all(
      [...this.terminals.keys()].map(n => this.kill(n).catch(() => {})),
    );
  }

  // ── Public: execution ───────────────────────────────────────────────────────

  /**
   * Run a blocking command on a terminal and wait for it to finish.
   * Auto-spawns the terminal if it doesn't exist yet.
   * Commands on the same terminal are serialised; different terminals run in parallel.
   */
  async exec(name: string, command: string, timeoutMs?: number): Promise<ExecResult> {
    await this._ensureSpawned(name);
    const entry = this.terminals.get(name)!;
    const ms = timeoutMs ?? this.cmdTimeoutMs;
    return this._enqueue(entry, () => this._execRaw(entry, name, command, ms));
  }

  /**
   * Start a long-running command (server, watcher, REPL) without blocking.
   * Output continues to flow into the terminal's ring buffer; use read() to inspect.
   */
  async startBackground(name: string, command: string): Promise<void> {
    await this._ensureSpawned(name);
    const entry = this.terminals.get(name)!;
    entry.status = 'background';
    entry.lastCommand = command;
    entry.pty.write(`${command}\n`);
  }

  /** Send raw stdin to a running or background process (e.g. answer a prompt). */
  write(name: string, input: string): void {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);
    entry.pty.write(input);
  }

  // ── Public: inspection ──────────────────────────────────────────────────────

  /** Return the last `lines` lines of buffered output (ANSI-stripped). */
  read(name: string, lines = 50): string {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);
    return stripAnsi(entry.buffer.tail(lines));
  }

  /** Metadata for all live terminals. */
  list(): TerminalInfo[] {
    return [...this.terminals.entries()].map(([n, e]) => ({
      name:        n,
      status:      e.status,
      cwd:         e.cwd,
      pid:         e.pty.pid,
      lastCommand: e.lastCommand,
      createdAt:   e.createdAt,
    }));
  }

  /** Metadata for one terminal (undefined if not found). */
  get(name: string): TerminalInfo | undefined {
    const e = this.terminals.get(name);
    if (!e) return undefined;
    return { name, status: e.status, cwd: e.cwd, pid: e.pty.pid, lastCommand: e.lastCommand, createdAt: e.createdAt };
  }

  has(name: string): boolean {
    return this.terminals.has(name);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  /** Ensure `name` is spawned; dedup concurrent first-spawn races. */
  private async _ensureSpawned(name: string): Promise<void> {
    if (this.terminals.has(name)) return;

    if (!this.spawnLocks.has(name)) {
      const p = this.spawn(name);
      this.spawnLocks.set(name, p);
      p.finally(() => this.spawnLocks.delete(name));
    }

    await this.spawnLocks.get(name)!;
  }

  /**
   * Per-terminal promise-queue mutex.
   * The chain (`entry.queue`) always resolves so future items don't get stuck.
   * The returned promise propagates the real result/error to the caller.
   */
  private _enqueue<T>(entry: TerminalEntry, fn: () => Promise<T>): Promise<T> {
    const p = entry.queue.then(() => fn());
    entry.queue = p.catch(() => undefined);
    return p;
  }

  /** Core exec: write command + sentinel, stream output until sentinel appears. */
  private _execRaw(
    entry:    TerminalEntry,
    name:     string,
    command:  string,
    timeoutMs: number,
  ): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve) => {
      const token   = crypto.randomUUID().replace(/-/g, '');
      const pattern = new RegExp(`__CLIC_END__${token}__(\\d+)__`);

      entry.status      = name === 'true' ? 'idle' : 'running';
      entry.lastCommand = command;

      let buf  = '';
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        disposable.dispose();
        entry.status = 'idle';
        resolve({
          output:   stripAnsi(buf).trim(),
          exitCode: null,
          timedOut: true,
          terminal: name,
        });
      }, timeoutMs);

      const disposable = entry.pty.onData((data: string) => {
        if (done) return;
        buf += data;
        const m = pattern.exec(buf);
        if (!m) return;

        done = true;
        clearTimeout(timer);
        disposable.dispose();
        entry.status = 'idle';

        resolve({
          output:   processOutput(buf, command, token),
          exitCode: parseInt(m[1], 10),
          timedOut: false,
          terminal: name,
        });
      });

      entry.pty.write(`${command}\nprintf '__CLIC_END__${token}__%d__\\n' "$?"\n`);
    });
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const terminalManager = new TerminalManager();
