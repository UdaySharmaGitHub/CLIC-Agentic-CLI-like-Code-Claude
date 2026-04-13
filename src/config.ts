// ─────────────────────────────────────────────────────────────────────────────
//  Config — environment loading, constants, KB file loading
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import fs from 'node:fs/promises';
import chalk from 'chalk';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_MAX_STEPS = 15;
export const HISTORY_FILE = process.env.AGENT_HISTORY_FILE || 'chat_history.json';

export interface AppConfig {
  apiKey: string;
  model: string;
  maxSteps: number;
  yolo: boolean;
  knowledgeBase?: string;
  kbFile?: string;
}

export async function loadKnowledgeBase(kbFile: string): Promise<{ content: string; file: string } | null> {
  try {
    const content = await fs.readFile(kbFile, 'utf-8');
    console.log(chalk.green(`  ✅ Role loaded from: ${chalk.white(kbFile)}`));
    const preview = content.split('\n').slice(0, 5);
    console.log(chalk.dim('  ── Role Preview (first 5 lines) ──────────────────────'));
    for (const line of preview) {
      console.log(chalk.dim(`  │  ${line}`));
    }
    const totalLines = content.split('\n').length;
    if (totalLines > 5) {
      console.log(chalk.dim(`  │  ... (${totalLines} lines total)`));
    }
    console.log(chalk.dim('  ──────────────────────────────────────────────────────'));
    return { content, file: kbFile };
  } catch {
    console.log(chalk.red(`  ⚠️  File not found: ${kbFile}`));
    console.log(chalk.yellow('  ⚡ Continuing as a generic assistant.'));
    return null;
  }
}
