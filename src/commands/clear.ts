// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion 
//
//  Clear Command: Clears the conversation history.
//   Usage: /clear
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { clearMessages,saveHistory } from '../memory.js';
import type { SlashCommand } from './types.js';

export const command:SlashCommand ={
    name:'/clear',
    description:'Clear the Conversation History',
    execute:async()=>{
        clearMessages();
        await saveHistory();
        console.log(chalk.yellow(' 🧹 🗑️ Conversation history cleared!'));
        console.log();
        return { type: "continue"};
    }
}