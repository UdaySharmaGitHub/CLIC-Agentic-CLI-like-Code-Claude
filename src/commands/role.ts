// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Role Command
//  This command allows the user to switch the active knowledge base / persona mid-session.
//   Usage: /role
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { select, isCancel } from '@clack/prompts';
import { loadKnowledgeBase } from '../config.js';
import { buildSystemPrompt } from '../prompts.js';
import type { SlashCommand } from './types.js';

export const command: SlashCommand = {
  name: '/role',
  description: 'Switch the active knowledge base / persona mid-session',
  execute: async () => {
    const rolesDir = path.resolve(process.cwd(), 'roles based Workflow');
    const roleOptions: Array<{ value: string; label: string; hint: string }> = [
      { value: '__none__', label: 'None (generic assistant)', hint: 'Remove current role' },
    ];

    try {
      const files = await fs.readdir(rolesDir);
      for (const file of files.filter(f => f.toLowerCase().endsWith('.md'))) {
        const label = file.replace(/\.md$/i, '').replace(/[_-]/g, ' ');
        roleOptions.push({ value: path.join(rolesDir, file), label, hint: file });
      }
    } catch {
      console.log(chalk.yellow('  ⚠️  "roles based Workflow/" folder not found — no roles available.'));
      console.log();
      return { type: 'continue' };
    }

    const choice = await select({
      message: 'Select a role:',
      options: roleOptions,
    });

    if (isCancel(choice)) {
      console.log(chalk.dim('  Cancelled.'));
      console.log();
      return { type: 'continue' };
    }

    if (choice === '__none__') {
      const newPrompt = buildSystemPrompt(undefined);
      console.log(chalk.green('  ✅ Role cleared — running as generic assistant.'));
      console.log();
      return { type: 'update', updates: { kbFile: undefined, systemPrompt: newPrompt } };
    }

    const kbPath = choice as string;
    const kb = await loadKnowledgeBase(kbPath);
    if (!kb) return { type: 'continue' };

    const newPrompt = buildSystemPrompt(kb.content);
    console.log(chalk.green(`  ✅ Role switched to: ${chalk.white(path.basename(kbPath))}`));
    console.log();
    return { type: 'update', updates: { kbFile: kb.file, systemPrompt: newPrompt } };
  },
};
