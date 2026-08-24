// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Command Line Intelligence Companion
//
//  Status Command: Show current system status, including message count, model info, and context settings.
//  Usage: /status
// ─────────────────────────────────────────────────────────────────────────────

import { messageCount } from "../memory.js";
import type { SlashCommand } from "./types.js";
import { printStatus } from "../ui.js";
import { getContextLimit } from "../config.js";
import { isEphemeral } from "../privacy.js";
import chalk from "chalk";

export const command:SlashCommand = {
    name:"/status",
    description:"Show System info and Session details",
    execute : async(ctx)=>{
       printStatus({
         messageCount:messageCount(),
        maxSteps:ctx.maxSteps,
        showRaw:ctx.showRaw,
        kbFile:ctx.kbFile,
        model:ctx.model,
        contextLimit: getContextLimit(),
        sessionName: ctx.sessionName,
       });
       console.log(isEphemeral()
         ? chalk.magenta('  🔒 Privacy: ON — nothing is written to disk (ephemeral session)')
         : chalk.dim('  🔓 Privacy: OFF — writing to disk normally'));
       console.log();
       return {type:'continue'};
    },
};