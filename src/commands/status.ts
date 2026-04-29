import { messageCount } from "../memory.js";
import type { SlashCommand } from "./types.js";
import { printStatus } from "../ui.js";

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
       });
       return {type:'continue'};
    },
};