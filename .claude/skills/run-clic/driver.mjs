#!/usr/bin/env node
/**
 * CLIC tmux driver
 *
 * Launches CLIC inside a tmux session and exposes commands to drive it
 * programmatically. Used by the /run-clic skill.
 *
 * Usage:
 *   node .claude/skills/run-clic/driver.mjs [command] [args...]
 *
 * Commands:
 *   launch [model]   Start a CLIC REPL session (default model: first from API)
 *   single <prompt>  Run a single-turn prompt, wait for completion, print output
 *   send <text>      Send text to the running REPL
 *   slash <cmd>      Send a slash command (e.g. /status, /tokens, /help)
 *   capture          Print current tmux pane contents
 *   wait <marker>    Poll until marker appears in pane (timeout 30s)
 *   quit             Send /exit and kill the tmux session
 *   kill             Force-kill the tmux session
 *
 * The tmux session is named "clic-driver". Run one session at a time.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSION = 'clic-driver';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');
const ENTRY = path.join(ROOT, 'src/index.ts');
const KB_DEFAULT = path.join(ROOT, 'roles based Workflow/Gen_AI_Engineer.md');
const WIDTH = 200;
const HEIGHT = 50;

function run(cmd, env = {}) {
  return spawnSync('bash', ['-c', cmd], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env } });
}

function tmux(args, env) {
  return run(`tmux ${args}`, env);
}

function sessionExists() {
  return tmux(`has-session -t ${SESSION} 2>/dev/null`).status === 0;
}

function capture() {
  const r = tmux(`capture-pane -t ${SESSION} -p`);
  return r.stdout;
}

function waitFor(marker, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pane = capture();
    if (pane.includes(marker)) return pane;
    // busy-wait with short pause
    spawnSync('sleep', ['0.2']);
  }
  throw new Error(`Timed out waiting for "${marker}" after ${timeoutMs}ms\nCurrent pane:\n${capture()}`);
}

const [, , command, ...rest] = process.argv;

switch (command) {
  case 'launch': {
    if (sessionExists()) {
      console.error(`Session "${SESSION}" already running. Run: node driver.mjs kill  first.`);
      process.exit(1);
    }
    const model = rest[0];
    const modelFlag = model ? `--model "$CLIC_MODEL"` : '';
    const env = { CLIC_ROOT: ROOT, CLIC_TSX: TSX, CLIC_ENTRY: ENTRY, CLIC_KB: KB_DEFAULT };
    if (model) env.CLIC_MODEL = model;
    tmux(`new-session -d -s ${SESSION} -x ${WIDTH} -y ${HEIGHT}`, env);
    const launchCmd = `cd "$CLIC_ROOT" && "$CLIC_TSX" "$CLIC_ENTRY" ${modelFlag} --kb "$CLIC_KB"`;
    run(`tmux send-keys -t ${SESSION} ${JSON.stringify(launchCmd)} Enter`, env);
    console.log('Waiting for model picker...');
    waitFor('Select the LLM model to use');
    tmux(`send-keys -t ${SESSION} Enter`);
    console.log('Model selected, waiting for REPL prompt...');
    waitFor('❯');
    console.log('CLIC REPL is ready.');
    console.log(capture());
    break;
  }

  case 'single': {
    const prompt = rest.join(' ');
    if (!prompt) { console.error('Usage: driver.mjs single <prompt>'); process.exit(1); }
    if (sessionExists()) tmux(`kill-session -t ${SESSION}`);
    const env = { CLIC_ROOT: ROOT, CLIC_TSX: TSX, CLIC_ENTRY: ENTRY, CLIC_KB: KB_DEFAULT, CLIC_PROMPT: prompt };
    tmux(`new-session -d -s ${SESSION} -x ${WIDTH} -y ${HEIGHT}`, env);
    const launchCmd = `cd "$CLIC_ROOT" && "$CLIC_TSX" "$CLIC_ENTRY" --kb "$CLIC_KB" --yolo "$CLIC_PROMPT"`;
    run(`tmux send-keys -t ${SESSION} ${JSON.stringify(launchCmd)} Enter`, env);
    console.log('Waiting for model picker...');
    waitFor('Select the LLM model to use', 20000);
    tmux(`send-keys -t ${SESSION} Enter`);
    console.log('Waiting for task completion...');
    waitFor('Task complete after', 60000);
    const out = capture();
    console.log(out);
    tmux(`kill-session -t ${SESSION} 2>/dev/null`);
    break;
  }

  case 'send': {
    if (!sessionExists()) { console.error('No active session. Run: driver.mjs launch'); process.exit(1); }
    const text = rest.join(' ');
    tmux(`send-keys -t ${SESSION} ${JSON.stringify(text)} Enter`);
    break;
  }

  case 'slash': {
    if (!sessionExists()) { console.error('No active session. Run: driver.mjs launch'); process.exit(1); }
    const cmd = rest[0] || '';
    const slash = cmd.startsWith('/') ? cmd : `/${cmd}`;
    tmux(`send-keys -t ${SESSION} ${JSON.stringify(slash)} Enter`);
    spawnSync('sleep', ['1']);
    console.log(capture());
    break;
  }

  case 'capture': {
    if (!sessionExists()) { console.error('No active session.'); process.exit(1); }
    console.log(capture());
    break;
  }

  case 'wait': {
    if (!sessionExists()) { console.error('No active session.'); process.exit(1); }
    const marker = rest.join(' ');
    if (!marker) { console.error('Usage: driver.mjs wait <marker>'); process.exit(1); }
    const pane = waitFor(marker);
    console.log(pane);
    break;
  }

  case 'quit': {
    if (!sessionExists()) { console.log('No session running.'); break; }
    tmux(`send-keys -t ${SESSION} '/exit' Enter`);
    spawnSync('sleep', ['2']);
    console.log(capture());
    tmux(`kill-session -t ${SESSION} 2>/dev/null`);
    console.log('Session closed.');
    break;
  }

  case 'kill': {
    tmux(`kill-session -t ${SESSION} 2>/dev/null`);
    console.log('Session killed.');
    break;
  }

  default: {
    console.error(`Unknown command: ${command}`);
    console.error('Available: launch, single, send, slash, capture, wait, quit, kill');
    process.exit(1);
  }
}
