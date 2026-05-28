// ─────────────────────────────────────────────────────────────────────────────
//  CLIC — Tokens Command
//  Shows actual token usage from the Knowledge Graph (when available) plus a
//  character-count estimate for the current in-memory conversation.
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import { getMessages } from '../memory.js';
import { getSessionTokenSummary, getGlobalTokenSummary, getSessionToolUsage } from '../knowledgeGraph.js';
import type { SlashCommand } from './types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const command: SlashCommand = {
  name: '/tokens',
  description: 'Show token usage from the Knowledge Graph and estimated conversation size',
  execute: async (ctx) => {
    const msgs = getMessages();
    const sep = chalk.dim(`  ${'─'.repeat(44)}`);

    // ── Actual usage from KG ─────────────────────────────────────────────────
    if (ctx.sessionId) {
      const session = getSessionTokenSummary(ctx.sessionId);
      const global  = getGlobalTokenSummary();
      const tools   = getSessionToolUsage(ctx.sessionId);

      // Check if any usage node in this session is estimated vs actual
      const { getGraph } = await import('../knowledgeGraph.js');
      const graph = getGraph();
      const sessionTurns = graph.edges
        .filter(e => e.from === ctx.sessionId && e.type === 'HAS_TURN')
        .map(e => e.to);
      const hasEstimated = sessionTurns.some(tId =>
        graph.edges
          .filter(e => e.from === tId && e.type === 'HAS_USAGE')
          .some(e => {
            const node = graph.nodes.find(n => n.id === e.to);
            return node?.properties.source === 'estimated';
          }),
      );
      const sourceTag = hasEstimated ? chalk.yellow(' (estimated)') : chalk.green(' (actual)');

      console.log();
      console.log(chalk.cyan.bold('  📊 Token Usage (Knowledge Graph)'));
      console.log(sep);
      console.log(chalk.bold('  This session') + sourceTag);
      console.log(`    ${chalk.dim('Prompt tokens')}       ${session.promptTokens.toLocaleString()}`);
      console.log(`    ${chalk.dim('Completion tokens')}   ${session.completionTokens.toLocaleString()}`);
      console.log(`    ${chalk.dim('Total tokens')}        ${chalk.white(session.totalTokens.toLocaleString())}`);
      console.log(`    ${chalk.dim('Agent turns')}         ${session.turnCount}`);

      if (Object.keys(tools).length > 0) {
        console.log();
        console.log(chalk.bold('  Tools used this session'));
        for (const [name, count] of Object.entries(tools)) {
          console.log(`    ${chalk.dim(name.padEnd(22))} ${count}×`);
        }
      }

      console.log();
      console.log(chalk.bold('  All-time total'));
      console.log(`    ${chalk.dim('Total tokens')}        ${chalk.white(global.totalTokens.toLocaleString())}`);
      console.log(`    ${chalk.dim('Agent turns')}         ${global.turnCount}`);
      console.log(sep);
    }

    // ── In-memory conversation estimate ─────────────────────────────────────
    let conversationTokens = 0;
    for (const msg of msgs) {
      const content = 'content' in msg && typeof msg.content === 'string' ? msg.content : '';
      conversationTokens += estimateTokens(content);
    }
    const sysTokens = ctx.systemPrompt ? estimateTokens(ctx.systemPrompt) : 0;
    const estimatedTotal = conversationTokens + sysTokens;

    console.log();
    console.log(chalk.cyan.bold('  📐 Context Size Estimate'));
    console.log(sep);
    if (sysTokens > 0) {
      console.log(`  ${chalk.dim('System prompt')}   ~${sysTokens.toLocaleString()} tokens`);
    }
    console.log(`  ${chalk.dim('Conversation')}    ~${conversationTokens.toLocaleString()} tokens  (${msgs.length} messages)`);
    console.log(`  ${chalk.dim('Total')}           ~${chalk.white(estimatedTotal.toLocaleString())} tokens`);
    console.log(sep);
    console.log(chalk.dim('  Estimate: ~4 chars/token. Actual varies by model.'));
    console.log();

    return { type: 'continue' };
  },
};
