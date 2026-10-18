import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import assert from 'node:assert/strict';
import { settings } from '../packages/config.ts';
import { mastra } from '../apps/retail/src/mastra/index.ts';
import { getOrderTool } from '../packages/orders/tool.ts';
async function main() {
for (const model of [settings.smallModel, settings.capableModel]) {
  const agent = new Agent({ id: 'model-check', name: 'Model check', model, instructions: 'Use the provided order tool for order questions.', tools: { getOrder: getOrderTool } });
  const tool = await agent.generate('Look up order-1001 using getOrder.', { maxSteps: 3 });
  assert.ok(tool.toolResults.length, 'Model must call the order tool');
  const structured = await agent.generate('Return status ready.', { structuredOutput: { schema: z.object({ status: z.literal('ready') }) } });
  assert.equal(structured.object.status, 'ready');
  console.log(JSON.stringify({ model, toolCalls: tool.toolResults.length, structuredOutput: 'passed', usage: { tool: tool.totalUsage, structured: structured.totalUsage } }));
}
await mastra.observability.flush();
}
main().catch(() => { console.error("Live verification failed. Check model access, billing, and fixture setup; sensitive error details are suppressed."); process.exitCode = 1; });
