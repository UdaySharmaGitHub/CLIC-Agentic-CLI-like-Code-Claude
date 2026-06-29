Look up the Claude / Anthropic API reference for the current task.

CLIC uses the `openai` npm package pointed at an OpenAI-compatible endpoint (BASE_URL in .env). When this project integrates Claude-native features (extended thinking, prompt caching, tool use schemas, streaming events, token counting), consult the Anthropic API docs.

Common lookups for this project:
- Model IDs: latest Sonnet / Haiku / Opus / Fable IDs for the model picker
- Tool use: `tool_calls` format, parallel tool execution, required fields
- Streaming: delta chunk shapes for `tool_call` assembly in `src/openai.ts`
- Token counting: `usage` field presence guarantees, input/output/cache token fields
- Context windows and pricing: for the `/tokens` command and KG estimation fallback

$ARGUMENTS
