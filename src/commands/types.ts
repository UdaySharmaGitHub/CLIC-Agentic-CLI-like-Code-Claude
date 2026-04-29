// ─────────────────────────────────────────────────────────────────────────────
//  Commands — shared types
// ─────────────────────────────────────────────────────────────────────────────


export interface CommandContext{
    model:string;
    maxSteps:number;
    showRaw:boolean;
    kbFile?:string;
}

export type CommandAction =
  | { type: 'continue' }
  | { type: 'exit' }
  | { type: 'update'; updates: Partial<CommandContext> };

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  execute: (ctx: CommandContext) => Promise<CommandAction>;
}