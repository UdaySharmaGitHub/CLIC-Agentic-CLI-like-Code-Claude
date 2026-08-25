// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — /export command
//  Serialises the active conversation to markdown, json, or html.
//  Usage: /export [markdown|json|html]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { getMessages, getHistoryFile } from '../memory.js';
import { isEphemeral } from '../privacy.js';
import type { ChatMessage, ToolCall } from '../memory.js';
import type { SlashCommand } from './types.js';

// ── Pure formatters (exported for testing) ──────────────────────────────────

export function toMarkdown(messages: ChatMessage[], session: string, model: string): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    '# CLIC Conversation Export',
    '',
    `- **Session:** ${session}`,
    `- **Model:** ${model}`,
    `- **Exported:** ${now}`,
    `- **Messages:** ${messages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    if (msg.role === 'user') {
      lines.push('## You', '', msg.content, '', '---', '');
    } else if (msg.role === 'assistant') {
      lines.push('## Assistant', '');
      if (msg.content) lines.push(msg.content, '');
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args = tc.function.arguments;
          try { args = JSON.stringify(JSON.parse(args), null, 2); } catch { /* use raw */ }
          lines.push(
            '<details>',
            `<summary>🔧 Tool: ${tc.function.name}</summary>`,
            '',
            '```json',
            args,
            '```',
            '',
            '</details>',
            '',
          );
        }
      }
      lines.push('---', '');
    }
  }

  return lines.join('\n');
}

export function toJson(messages: ChatMessage[], session: string, model: string): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), session, model, messages },
    null,
    2,
  );
}

export function toHtml(messages: ChatMessage[], session: string, model: string): string {
  const now = new Date().toISOString();

  function esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;max-width:860px;margin:0 auto}
    .header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:24px}
    .header h1{color:#58a6ff;font-size:18px;margin-bottom:6px}
    .header p{color:#8b949e;font-size:13px;line-height:1.6}
    .message{margin-bottom:14px}
    .badge{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .user .badge{color:#58a6ff}
    .assistant .badge{color:#3fb950}
    .bubble{padding:12px 16px;border-radius:8px;line-height:1.6;font-size:14px;white-space:pre-wrap;word-break:break-word}
    .user .bubble{background:#1f6feb;color:#fff}
    .assistant .bubble{background:#161b22;border:1px solid #30363d}
    details{margin-top:8px}
    summary{cursor:pointer;color:#8b949e;font-size:12px;padding:4px 0;user-select:none}
    summary:hover{color:#c9d1d9}
    pre{background:#010409;border:1px solid #30363d;border-radius:6px;padding:12px;overflow-x:auto;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;margin-top:8px}
  `.trim();

  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    if (msg.role === 'user') {
      parts.push(
        `<div class="message user">`,
        `  <div class="badge">You</div>`,
        `  <div class="bubble">${esc(msg.content)}</div>`,
        `</div>`,
      );
    } else if (msg.role === 'assistant') {
      const textHtml = msg.content ? esc(msg.content) : '';
      const toolHtml = (msg.tool_calls ?? []).map((tc: ToolCall) => {
        let args = tc.function.arguments;
        try { args = JSON.stringify(JSON.parse(args), null, 2); } catch { /* use raw */ }
        return `<details><summary>🔧 Tool: ${esc(tc.function.name)}</summary><pre>${esc(args)}</pre></details>`;
      }).join('\n');
      parts.push(
        `<div class="message assistant">`,
        `  <div class="badge">Assistant</div>`,
        `  <div class="bubble">${textHtml}\n${toolHtml}</div>`,
        `</div>`,
      );
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CLIC Export — ${esc(session)}</title>
<style>${css}</style>
</head>
<body>
<div class="header">
  <h1>CLIC Conversation Export</h1>
  <p>Session: <strong>${esc(session)}</strong> &nbsp;·&nbsp; Model: ${esc(model)} &nbsp;·&nbsp; Exported: ${now} &nbsp;·&nbsp; ${messages.length} messages</p>
</div>
${parts.join('\n')}
</body>
</html>`;
}

// ── Filename collision avoidance ─────────────────────────────────────────────

async function resolveFilename(dir: string, base: string, ext: string): Promise<string> {
  const first = path.join(dir, `${base}.${ext}`);
  try {
    await fs.access(first);
    // File exists — find next available counter
    for (let i = 2; ; i++) {
      const next = path.join(dir, `${base}-${i}.${ext}`);
      try { await fs.access(next); } catch { return next; }
    }
  } catch {
    return first;
  }
}

// ── Command ──────────────────────────────────────────────────────────────────

const VALID_FORMATS = ['markdown', 'json', 'html'] as const;
type Format = typeof VALID_FORMATS[number];

export const command: SlashCommand = {
  name: '/export',
  description: 'Export conversation to a file',
  usage: '/export [markdown|json|html]',
  execute: async (ctx, args) => {
    // Step 1: resolve format
    let format: Format;
    if (args && (VALID_FORMATS as readonly string[]).includes(args)) {
      format = args as Format;
    } else {
      const picked = await select({
        message: 'Export format:',
        options: [
          { value: 'markdown', label: 'Markdown', hint: 'Human-readable .md file' },
          { value: 'json',     label: 'JSON',     hint: 'Raw message array with metadata' },
          { value: 'html',     label: 'HTML',     hint: 'Self-contained styled page' },
        ],
      });
      if (isCancel(picked)) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }
      format = picked as Format;
    }

    // Step 2: resolve scope
    let messages: ChatMessage[];
    const ephemeral = isEphemeral();

    if (ephemeral) {
      console.log(chalk.dim('  Running in privacy mode — exporting current window only.'));
      messages = getMessages();
    } else {
      const scopeOptions = [
        { value: 'window', label: 'Current window', hint: `${getMessages().length} messages in memory` },
        { value: 'full',   label: 'Full history',   hint: 'Load complete history from disk' },
      ];
      const pickedScope = await select({ message: 'Export scope:', options: scopeOptions });
      if (isCancel(pickedScope)) {
        console.log(chalk.dim('  Export cancelled.'));
        console.log();
        return { type: 'continue' };
      }

      if (pickedScope === 'full') {
        try {
          const raw = await fs.readFile(getHistoryFile(), 'utf-8');
          messages = JSON.parse(raw) as ChatMessage[];
        } catch (err) {
          console.log(chalk.yellow(`  ⚠️  Could not read history file — falling back to current window. (${(err as Error).message})`));
          messages = getMessages();
        }
      } else {
        messages = getMessages();
      }
    }

    // Step 3: build content
    const session = ctx.sessionName ?? 'default';
    const extMap: Record<Format, string> = { markdown: 'md', json: 'json', html: 'html' };
    const dateStr = new Date().toISOString().slice(0, 10);
    const base = `clic-export-${dateStr}`;
    const exportDir = path.join(process.cwd(), 'exports');
    try {
      await fs.mkdir(exportDir, { recursive: true });
    } catch (err) {
      console.log(chalk.red(`  ✗ Could not create exports/ directory: ${(err as Error).message}`));
      console.log();
      return { type: 'continue' };
    }
    const filePath = await resolveFilename(exportDir, base, extMap[format]);

    let content: string;
    if (format === 'markdown')  content = toMarkdown(messages, session, ctx.model);
    else if (format === 'json') content = toJson(messages, session, ctx.model);
    else                        content = toHtml(messages, session, ctx.model);

    try {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(chalk.green(`  ✅ Exported to ${filePath}`));
    } catch (err) {
      console.log(chalk.red(`  ✗ Export failed: ${(err as Error).message}`));
    }

    console.log();
    return { type: 'continue' };
  },
};
