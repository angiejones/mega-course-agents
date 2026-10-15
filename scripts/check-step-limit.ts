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
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
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
        toolName: 'getOrder',
        input: JSON.stringify({ orderId: 'order-1001' }),
      }],
      finishReason: 'tool-calls',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
});

try {
  const result = await mastra.getAgent('retailAgent').generate(
    'Look up order-1001.',
    {
      memory: { resource: settings.customerId, thread: randomUUID() },
      prepareStep: () => ({ model }),
    },
  );
  assert.equal(result.steps.length, 5, 'The default must stop at five steps');
  assert.equal(modelCalls, 5, 'The runtime must not make a sixth model call');
  assert.equal(result.toolResults.length, 5, 'Every scripted tool call must run');
  for (const tool of result.toolResults) {
    const lookup = tool.payload.result;
    assert.ok(lookup && typeof lookup === 'object' && 'found' in lookup);
    assert.equal(lookup.found, true, 'Each lookup must succeed');
  }
  console.log(JSON.stringify({
    check: 'five-step-limit',
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
  await mastra.observability.flush();
}
