import { randomUUID } from 'node:crypto';
import { settings } from '../packages/config.ts';
import assert from 'node:assert/strict';
import { mastra } from '../apps/retail/src/mastra/index.ts';
import { openStore, seed } from '../packages/store/index.ts';
async function main() {
const db = openStore(); seed(db); db.close();
const agent = mastra.getAgent('retailAgent');
try {
  const result = await agent.generate('Look up order-1001. What did I buy?', { maxSteps: 4, memory: { resource: settings.customerId, thread: randomUUID() } });
  assert.ok(result.toolResults.length, 'Expected an actual tool call');
  assert.match(JSON.stringify(result.toolResults), /jacket-blue-m/);
  await mastra.observability.flush();
  assert.ok(result.traceId, 'Expected trace ID');
  const store = await mastra.getStorage()?.getStore('observability');
  const trace = await store?.getTrace({ traceId: result.traceId! });
  assert.ok(trace, 'Expected a persisted trace');
  console.log(JSON.stringify({ evaluation: 'owned-order-and-persisted-trace', passed: true, traceId: result.traceId, usage: result.totalUsage }));
} finally { await mastra.observability.flush(); }
}
main().catch(() => { console.error("Live verification failed. Check model access, billing, and fixture setup; sensitive error details are suppressed."); process.exitCode = 1; });
