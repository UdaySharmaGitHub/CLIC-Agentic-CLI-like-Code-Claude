// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Help Command: Displays available commands and capabilities.
//  Usage: /help
// ─────────────────────────────────────────────────────────────────────────────

import { printHelp } from "../ui/index.js";
import type { SlashCommand } from "./types.js";

export const command:SlashCommand={
    name:'/help',
    description:'show capabilites and Commands',
    execute:async()=>{
        await printHelp();
        return {type:'continue'};
    },
};