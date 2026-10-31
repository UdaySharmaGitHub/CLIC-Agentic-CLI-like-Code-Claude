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

  constructor(private readonly maxLines: number) { }

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
  shell: TERMINAL_SHELL,
  maxTerminals: TERMINAL_MAX,
  cmdTimeoutMs: TERMINAL_CMD_TIMEOUT_MS,
  bufferLines: TERMINAL_BUFFER_LINES,
};

// ── Internal entry (not exported) ─────────────────────────────────────────────

interface TerminalEntry {
  pty: IPty;
  status: TerminalStatus;
  buffer: RingBuffer;
  cwd: string;
  createdAt: string;
  lastCommand?: string;
  // Set by startBackground; cleared by waitFor when the sentinel is detected.
  // Allows waitFor to resolve the instant the process exits instead of waiting
  // out the quiet-detection window.
  sentinelToken?: string;
  // Per-terminal mutex: always resolves, never rejects.
  // Callers chain onto this to serialise exec() calls on the same terminal.
  queue: Promise<unknown>;
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

/**
 * Clean buffered PTY output for display (used by read() and waitFor()).
 * Unlike processOutput() — which is scoped to a single exec() with a known
 * command + sentinel token — this cleans an arbitrary span of the ring buffer:
 *  - strip ANSI/VT escapes
 *  - apply backspaces (the shell's line-editor / autosuggestion redraw)
 *  - drop right-pad whitespace, sentinel lines, printf-sentinel echoes, and
 *    oh-my-zsh / bare shell prompt lines (which carry the echoed command)
 */
export function cleanBuffer(raw: string, command?: string): string {
  let s = stripAnsi(raw);
  // Resolve backspaces: each "<char><BS>" pair cancels out. Bounded passes
  // handle runs like "ab\b\b"; a final sweep removes any stray leading BS.
  for (let i = 0; i < 8 && s.includes('\x08'); i++) s = s.replace(/[^\x08]\x08/g, '');
  s = s.replace(/\x08/g, '');
  const firstChunk = command?.trimStart().slice(0, 18);
  return s
    .split('\n')
    .map(l => l.replace(/[ \t]+$/, ''))
    .filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/__CLIC_END__[0-9a-fA-F]+__-?\d+__/.test(t)) return false;
      if (t.startsWith("printf '__CLIC_END__")) return false;
      // Echoed command line (PTY echoes typed input; zsh may append a `>`).
      if (firstChunk && t.replace(/>+$/, '').trimEnd().startsWith(firstChunk)) return false;
      // oh-my-zsh (➜ / ➜ with git status) and bare prompts — these lines also
      // carry the echoed command, so dropping them removes the echo too.
      if (t.includes('➜') || t.startsWith('%') || /^[$#]\s/.test(t) || t === '%' || t === '$' || t === '#') return false;
      return true;
    })
    .join('\n')
    .trim();
}

// ── TerminalManager ───────────────────────────────────────────────────────────
class TerminalManager {
  private readonly terminals = new Map<string, TerminalEntry>();
  private readonly spawnLocks = new Map<string, Promise<void>>();  // dedup concurrent spawns

  private readonly shell: string;
  private readonly maxTerminals: number;
  private readonly cmdTimeoutMs: number;
  private readonly bufferLines: number;

  constructor(opts: Partial<typeof DEFAULTS> = {}) {
    this.shell = opts.shell ?? DEFAULTS.shell;
    this.maxTerminals = opts.maxTerminals ?? DEFAULTS.maxTerminals;
    this.cmdTimeoutMs = opts.cmdTimeoutMs ?? DEFAULTS.cmdTimeoutMs;
    this.bufferLines = opts.bufferLines ?? DEFAULTS.bufferLines;
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
      pty: proc,
      status: 'idle',
      buffer: new RingBuffer(this.bufferLines),
      cwd: workDir,
      createdAt: new Date().toISOString(),
      queue: Promise.resolve(),
    };

    // Persistent handler: all output flows into the ring buffer.
    proc.onData((data: string) => entry.buffer.push(data));

    this.terminals.set(name, entry);

    // Let the shell fully initialise before we start issuing commands.
    await new Promise<void>(r => setTimeout(r, 800));
    // Flush welcome noise (motd, .zshrc output, etc.)
    await this._execRaw(entry, name, 'true', 5_000).catch(() => { });
    // Discard the flush noise (welcome banner, the `true` echo, its sentinel,
    // trailing prompt redraw) so the terminal presents a clean, empty buffer.
    await new Promise<void>(r => setTimeout(r, 50));
    entry.buffer.clear();
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
      [...this.terminals.keys()].map(n => this.kill(n).catch(() => { })),
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
    // Generate a per-command token so waitFor knows exactly when THIS command
    // exits, not a leftover sentinel from a previous exec.
    const token = crypto.randomUUID().replace(/-/g, '');
    entry.sentinelToken = token;
    // Single compound line: the printf always runs regardless of exit code,
    // capturing $? correctly without polluting stdin with a second write.
    entry.pty.write(`${command}; printf '__CLIC_END__${token}__%d__\\n' "$?"\n`);
  }

  /** Send raw stdin to a running or background process (e.g. answer a prompt). */
  write(name: string, input: string): void {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);
    entry.pty.write(input);
  }

  // ── Public: inspection ──────────────────────────────────────────────────────

  /** Return the last `lines` lines of buffered output (cleaned for display). */
  read(name: string, lines = 50): string {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);
    return cleanBuffer(entry.buffer.tail(lines), entry.lastCommand);
  }

  /**
   * Block until a terminal finishes or a pattern appears in its output.
   *  - If `pattern` is given: resolve when the buffer matches it.
   *  - Otherwise: resolve when output goes "quiet" (no new bytes for quietMs).
   *
   * Quiet detection ignores the command echo and prompt noise (it measures the
   * CLEANED buffer), and will not settle until *real* output has appeared — so a
   * command that is silent during startup (pnpm build/test, a sleep, a slow
   * fetch) is no longer mistaken for "already finished." A command that
   * legitimately prints nothing still resolves after `noOutputGraceMs`.
   * Always resolves; never hangs past timeoutMs.
   */
  async waitFor(
    name: string,
    opts: { pattern?: string; timeoutMs?: number; quietMs?: number } = {},
  ): Promise<{ matched: boolean; timedOut: boolean; output: string; exitCode?: number | null }> {
    const entry = this.terminals.get(name);
    if (!entry) throw new Error(`Terminal "${name}" not found.`);

    const timeoutMs = opts.timeoutMs ?? 30_000;
    const quietMs = opts.quietMs ?? 1_200;
    const re = opts.pattern ? new RegExp(opts.pattern) : null;
    const noOutputGraceMs = Math.min(4_000, timeoutMs);
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;

    let lastLen = -1;
    let quietSince = Date.now();

    while (Date.now() < deadline) {
      const rawTail = entry.buffer.tail(1000);
      const clean = cleanBuffer(rawTail, entry.lastCommand);

      // Condition 0: sentinel-based true completion (set by startBackground).
      // Resolves the instant the process exits — no quiet-window tax.
      if (entry.sentinelToken) {
        const sentinelRe = new RegExp(`__CLIC_END__${entry.sentinelToken}__(\\d+)__`);
        const m = sentinelRe.exec(stripAnsi(rawTail));
        if (m) {
          const exitCode = parseInt(m[1], 10);
          entry.sentinelToken = undefined;
          entry.status = 'idle';
          // If caller also specified a pattern, report whether it matched in the final output.
          const patternMatched = re ? re.test(clean) : false;
          return { matched: patternMatched, timedOut: false, output: clean, exitCode };
        }
      }

      // Condition 1: pattern matched (test against ANSI-stripped raw so that
      // prompt/echo text the caller is waiting on is still visible).
      if (re && re.test(stripAnsi(rawTail))) {
        // Clear any pending sentinel token so it can't trip a subsequent waitFor
        // call on the same terminal (the command may have already exited by then).
        entry.sentinelToken = undefined;
        return { matched: true, timedOut: false, output: clean };
      }

      // Condition 2: quiet detection (only when no pattern given). Measure the
      // CLEANED buffer so prompt redraws and the echoed command don't count.
      if (!re) {
        if (clean.length !== lastLen) {
          lastLen = clean.length;
          quietSince = Date.now();            // real output still flowing → reset
        } else if (entry.status !== 'running' && Date.now() - quietSince >= quietMs) {
          const sawOutput = clean.length > 0;
          // Settle once real output appeared and went quiet, or after a grace
          // period for commands that genuinely produce no output.
          if (sawOutput || Date.now() - startedAt >= noOutputGraceMs) {
            return { matched: false, timedOut: false, output: clean };
          }
        }
      }

      await new Promise(r => setTimeout(r, 200));  // poll every 200ms
    }

    return { matched: false, timedOut: true, output: cleanBuffer(entry.buffer.tail(1000), entry.lastCommand) };
  }


  /** Metadata for all live terminals. */
  list(): TerminalInfo[] {
    return [...this.terminals.entries()].map(([n, e]) => ({
      name: n,
      status: e.status,
      cwd: e.cwd,
      pid: e.pty.pid,
      lastCommand: e.lastCommand,
      createdAt: e.createdAt,
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
    entry: TerminalEntry,
    name: string,
    command: string,
    timeoutMs: number,
  ): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve) => {
      const token = crypto.randomUUID().replace(/-/g, '');
      const pattern = new RegExp(`__CLIC_END__${token}__(\\d+)__`);

      // 'true' is the spawn-flush command (see spawn); don't treat it as a
      // user command that flips the terminal to "running".
      entry.status = command === 'true' ? entry.status : 'running';
      entry.lastCommand = command;

      let buf = '';
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        disposable.dispose();
        entry.status = 'idle';
        resolve({
          output: stripAnsi(buf).trim(),
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
          output: processOutput(buf, command, token),
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
