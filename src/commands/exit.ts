// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Exit command: Saves the conversation history and exits the agent.
//   Usage: /exit
//          /quit
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { saveHistory } from "../memory.js"
import { SlashCommand } from "./types.js";
import { HISTORY_FILE } from '../config.js';

export const command:SlashCommand = {
    name:'/exit',
    aliases:['/quit'],
    description:'Quit the Agent and save History',
    execute: async () => {
    await saveHistory();
    console.log();
    console.log(chalk.green(`  ✅ History saved → ${HISTORY_FILE}`));
    console.log(chalk.cyan('  👋 Goodbye!'));
    console.log();
    return { type: 'exit' };
  },
}