import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCPClient } from '@mastra/mcp';

const directory = resolve('data/mcp-exchange', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const db = openExchangeStore(process.env.STORE_DB_PATH);
const evidence: object[] = [];
const input = { orderId: 'order-1001', sku: 'jacket-blue-m', replacementSku: 'jacket-blue-l', quantity: 1, message: 'My blue jacket is too tight across my shoulders. I would like the same jacket in size L.' };
const count = () => Number(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n);
try {
  for (const scenario of ['decline', 'cancel-form', 'decline-form', 'invalid-answer', 'stock-changed', 'confirm', 'wrong-owner'] as const) {
    // This database was created exclusively for this rehearsal. Reset between cases.
    for (const table of ['exchanges', 'exchange_requests', 'inventory', 'variants', 'exchange_policy', 'quality_reviews', 'orders', 'customer_preferences']) db.exec(`DELETE FROM ${table}`);
    seedExchangeStore(db);
    let requests = 0;
    const stockBefore = Number(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available);
    const client = new MCPClient({
      id: `exchange-${scenario}-${randomUUID()}`,
      servers: { orders: {
        url: new URL(process.env.ORDER_MCP_URL!), protocolVersion: '2026-07-28', timeout: 60000,
        inputRequests: async ({ params }) => {
          requests++;
          assert.equal(count(), 0, 'No exchange before the customer answers');
          assert.equal(params.mode, 'form');
          assert.match(params.message, /order-1001/);
          assert.match(params.message, /jacket-blue-m/);
          assert.match(params.message, /jacket-blue-l/);
          assert.match(params.message, /Credit: USD 79.00/);
          assert.match(params.message, /Amount due: USD 0.00/);
          assert.ok('requestedSchema' in params);
          assert.match(JSON.stringify(params.requestedSchema), /confirm/);
          assert.match(JSON.stringify(params.requestedSchema), /decline/);
          if (scenario === 'cancel-form') return { action: 'cancel' as const };
          if (scenario === 'decline-form') return { action: 'decline' as const };
          if (scenario === 'stock-changed') db.prepare('UPDATE inventory SET available=0 WHERE sku=?').run(input.replacementSku);
          return { action: 'accept' as const, content: { decision: scenario === 'decline' ? 'decline' : scenario === 'invalid-answer' ? 'maybe' : 'confirm' } };
        },
      } },
    });
    try {
      const tools = await client.listTools();
      assert.ok(tools.orders_getOrder && tools.orders_getInventory && tools.orders_exchangeWithConfirmation);
      const execute = () => tools.orders_exchangeWithConfirmation.execute!({ ...input, ...(scenario === 'wrong-owner' ? { orderId: 'order-1002' } : {}) }, {} as never);
      if (['cancel-form', 'decline-form', 'invalid-answer'].includes(scenario)) {
        await assert.rejects(execute, scenario === 'cancel-form' ? /cancelled/ : scenario === 'decline-form' ? /declined/ : /Invalid option/);
        assert.equal(count(), 0);
        assert.equal(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available, stockBefore);
      } else {
        const result = await execute() as { status: string; source?: string; customerDecision?: string };
        const expected = scenario === 'confirm' ? 'committed' : scenario === 'decline' ? 'declined' : 'rejected';
        assert.equal(result.status, expected);
        assert.equal(count(), scenario === 'confirm' ? 1 : 0);
        if (scenario !== 'wrong-owner') {
          assert.equal(result.source, 'user_elicitation');
          assert.equal(result.customerDecision, scenario === 'decline' ? 'decline' : 'confirm');
        }
        if (scenario === 'confirm') {
          assert.equal(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available, stockBefore - 1);
          const repeat = await execute() as { status: string };
          assert.equal(repeat.status, 'rejected', 'A fresh repeat cannot exchange the same purchased quantity again');
          assert.equal(count(), 1);
        }
        if (scenario === 'decline') assert.equal(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available, stockBefore);
        evidence.push({ scenario, result });
      }
      assert.equal(requests, scenario === 'wrong-owner' ? 0 : 1);
      evidence.push({ scenario, requests, exchanges: count(), passed: true });
      console.log(`Passed: ${scenario}`);
    } finally { await client.disconnect(); }
  }
} finally {
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  db.close();
  await mastra.observability.flush();
  await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
