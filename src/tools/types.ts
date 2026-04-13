// ─────────────────────────────────────────────────────────────────────────────
//  Tools — shared types
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmFn = (message: string) => Promise<boolean>;

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}
