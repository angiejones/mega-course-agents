import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';

const directory = resolve('data/step-limit', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { settings } = await import('../packages/config.ts');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const closeOrderMcp = await startOrderMcpFixture();
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { customerServiceConfig } = await import('../apps/retail/src/mastra/agent.ts');
const originalOrderLookup = customerServiceConfig.orderLookup;
const { openStore, seed } = await import('../packages/store/index.ts');
const db = openStore();
seed(db);
db.close();

// A live model can spend a step reasoning without requesting a tool, even
// with toolChoice set. Always request a tool here to isolate the runtime cap.
let modelCalls = 0;
const model = new MastraLanguageModelV2Mock({
  doGenerate: async () => {
    modelCalls += 1;
    return {
      content: [{
        type: 'tool-call',
        toolCallId: `lookup-${modelCalls}`,
        toolName: 'orders_getOrder',
        input: JSON.stringify({ orderId: 'order-1001' }),
      }],
      finishReason: 'tool-calls',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
});

// This check needs the lookup tool, regardless of the recording configuration.
try {
  customerServiceConfig.orderLookup = true;
  const result = await mastra.getAgent('retailAgent').generate(
    'Look up order-1001.',
    {
      memory: { resource: settings.customerId, thread: randomUUID() },
      prepareStep: () => ({ model }),
    },
  );
  assert.equal(result.steps.length, 12, 'The default must stop at twelve steps');
  assert.equal(modelCalls, 12, 'The runtime must not make a thirteenth model call');
  assert.equal(result.toolResults.length, 12, 'Every scripted tool call must run');
  for (const tool of result.toolResults) {
    const lookup = tool.payload.result;
    assert.ok(lookup && typeof lookup === 'object' && 'found' in lookup);
    assert.equal(lookup.found, true, 'Each lookup must succeed');
  }
  console.log(JSON.stringify({
    check: 'twelve-step-limit',
    model: 'deterministic test double',
    passed: true,
    steps: result.steps.length,
    toolCalls: result.toolResults.length,
    finishReason: result.finishReason,
    traceId: result.traceId,
  }));
} catch (error) {
  console.error(error instanceof assert.AssertionError
    ? error.message : 'Step-limit verification failed.');
  process.exitCode = 1;
} finally {
  customerServiceConfig.orderLookup = originalOrderLookup;
  await mastra.observability.flush(); await closeOrderMcp();
}
