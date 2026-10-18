import assert from 'node:assert/strict';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { noopObserve } from '@mastra/core/tools';

const directory = resolve('data/capabilities', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const db = openExchangeStore(process.env.STORE_DB_PATH);
seedExchangeStore(db);
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { createOrderClient, listMcpResourcesTool, readMcpResourceTool } = await import('../packages/mcp/order-client.ts');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const evidence: object[] = [];
const client = createOrderClient();
try {
  const tools = await client.listTools();
  assert.deepEqual(Object.keys(tools).sort(), ['orders_exchangeWithConfirmation', 'orders_getInventory', 'orders_getOrder']);
  const agentTools = await mastra.getAgent('retailAgent').listTools();
  assert.ok(agentTools.orders_getOrder, 'Agent must register the discovered MCP tool');
  assert.equal(agentTools.getOrder, undefined, 'No custom getOrder alias');
  const owned = await tools.orders_getOrder.execute!({ orderId: 'order-1001' }, { observe: noopObserve });
  const denied = await tools.orders_getOrder.execute!({ orderId: 'order-1002' }, { observe: noopObserve });
  assert.ok(owned && typeof owned === 'object' && 'found' in owned);
  assert.equal(owned.found, true);
  assert.ok(denied && typeof denied === 'object' && 'found' in denied);
  assert.equal(denied.found, false);
  const resources = z.record(z.string(), z.array(z.object({ name: z.string(), uri: z.string() }).passthrough())).parse(
    await listMcpResourcesTool.execute!({}, { observe: noopObserve }));
  assert.equal(resources.orders.length, 2);
  const policyUri = resources.orders.find(resource => resource.name === 'Return and exchange policy')!.uri;
  const policy = await readMcpResourceTool.execute!({ server: 'orders', uri: policyUri }, { observe: noopObserve });
  assert.match(JSON.stringify(policy), /30 calendar days/);
  const sizeUri = resources.orders.find(resource => resource.name === 'Jacket size guide')!.uri;
  const sizes = await readMcpResourceTool.execute!({ server: 'orders', uri: sizeUri }, { observe: noopObserve });
  assert.match(JSON.stringify(sizes), /M \| 94–101/);
  assert.match(JSON.stringify(sizes), /100 cm chest falls in size M/);
  await assert.rejects(readMcpResourceTool.execute!({ server: 'orders', uri: 'retail://unknown' }, { observe: noopObserve }));
  await assert.rejects(readMcpResourceTool.execute!({ server: 'unconfigured', uri: policyUri }, { observe: noopObserve }));
  evidence.push({ check: 'MCP tools and resources', protocol: '2026-07-28', owned, denied, resources, policy, sizes });
  if (process.argv.includes('--live')) {
    const instructions = String(await mastra.getAgent('retailAgent').getInstructions());
    assert.doesNotMatch(instructions, /listMcpResources|readMcpResource|return policy or jacket sizing/, 'No resource-routing instructions in the system prompt');
    for (const [prompt, requiredTool, phrase] of [
      ['What is your return policy?', 'readMcpResource', /30/],
      ['My chest measures 100 cm. What jacket size should I choose?', 'readMcpResource', /\bM\b|\bmedium\b/i],
      ['Look up order-1001.', 'orders_getOrder', /order-1001/],
    ] as const) {
      const modelInputs: unknown[] = [];
      const result = await mastra.getAgent('retailAgent').generate(prompt, {
        memory: { resource: 'customer-alex', thread: randomUUID() },
        inputProcessors: [{ id: 'capture-provider-prompt', processLLMRequest: ({ prompt }) => {
          modelInputs.push(JSON.parse(JSON.stringify(prompt)));
        } }],
      });
      evidence.push({ prompt, text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults, modelInputs, traceId: result.traceId });
      writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
      assert.ok(result.toolCalls.some(call => call.payload.toolName === requiredTool));
      if (requiredTool === 'readMcpResource') {
        const calls = result.toolCalls.map(call => call.payload.toolName);
        assert.ok(calls.indexOf('listMcpResources') >= 0 && calls.indexOf('listMcpResources') < calls.indexOf('readMcpResource'), 'Discover resources before reading');
      }
      if (requiredTool === 'orders_getOrder') {
        assert.ok(!result.toolCalls.some(call => ['listMcpResources', 'readMcpResource'].includes(call.payload.toolName)), 'Order lookup should not need resource discovery');
      }
      assert.match(result.text, phrase);
      const initialPrompt = JSON.stringify(modelInputs[0]);
      assert.ok(initialPrompt.includes('Customer identity comes from the application session'));
      assert.ok(!initialPrompt.includes('30 calendar days'), 'Policy must be retrieved, not always included');
      assert.ok(!initialPrompt.includes('## Before reporting success'), 'Skill body should not be preloaded');
      assert.ok(!result.toolCalls.some(call => ['exchangeWithConfirmation','confirmExchange'].includes(call.payload.toolName)));
      console.log(`Passed: ${prompt}`);
    }
  }
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`MCP ownership, resources and runtime instructions passed. Evidence: ${directory}/evidence.json`);
} finally {
  db.close();
  await client.disconnect();
  await mastra.observability.flush();
  await close();
}
