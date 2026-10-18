import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCPClient } from '@mastra/mcp';
const directory = resolve('data/mcp-app', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
process.env.RETAIL_MCP_APPS = 'true';
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const db = openExchangeStore(process.env.STORE_DB_PATH);
const client = new MCPClient({ id: randomUUID(), servers: { orders: { url: new URL(process.env.ORDER_MCP_URL!), protocolVersion: '2026-07-28', timeout: 60000 } } });
const evidence: object[] = [];
try {
  const tools = await client.listTools();
  assert.ok(tools.orders_previewExchange && tools.orders_decideExchange);
  assert.equal((tools.orders_previewExchange.mcp?._meta?.ui as { resourceUri: string }).resourceUri, 'ui://retail/exchange.html');
  assert.deepEqual((tools.orders_decideExchange.mcp?._meta?.ui as { visibility: string[] }).visibility, ['app']);
  const html = await client.resources.read('orders', 'ui://retail/exchange.html');
  assert.match(JSON.stringify(html), /text\/html;profile=mcp-app/);
  assert.match(JSON.stringify(html), /Confirm exchange/);
  const input = { orderId: 'order-1001', sku: 'jacket-blue-m', replacementSku: 'jacket-blue-l', quantity: 1, message: 'My blue jacket is too tight across my shoulders. I want the same jacket in size L.' };
  const call = async (name: string, args: object) => await tools[`orders_${name}`].execute!(args, {} as never) as Record<string, any>;
  const count = () => Number(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n);
  for (const scenario of ['decline', 'stock-changed', 'confirm', 'wrong-owner'] as const) {
    for (const table of ['exchanges', 'exchange_requests', 'inventory', 'variants', 'exchange_policy', 'quality_reviews', 'orders', 'customer_preferences']) db.exec(`DELETE FROM ${table}`);
    seedExchangeStore(db);
    const stock = Number(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available);
    const preview = await call('previewExchange', { ...input, ...(scenario === 'wrong-owner' ? { orderId: 'order-1002' } : {}) });
    assert.equal(count(), 0);
    if (scenario === 'wrong-owner') { assert.equal(preview.status, 'rejected'); assert.equal(preview.confirmationToken, undefined); }
    else {
      assert.equal(preview.status, 'awaiting_confirmation');
      assert.equal(preview.proposal.creditCents, 7900);
      assert.equal(preview.items[1].size, 'L');
      await assert.rejects(call('decideExchange', { confirmationToken: preview.confirmationToken + 'x', decision: 'confirm' }), /Invalid exchange/);
      assert.equal(count(), 0);
      if (scenario === 'stock-changed') db.prepare('UPDATE inventory SET available=0 WHERE sku=?').run(input.replacementSku);
      const decision = scenario === 'decline' ? 'decline' : 'confirm';
      const outcome = await call('decideExchange', { confirmationToken: preview.confirmationToken, decision });
      assert.equal(outcome.status, scenario === 'stock-changed' ? 'rejected' : scenario === 'confirm' ? 'committed' : 'declined');
      assert.equal(count(), scenario === 'confirm' ? 1 : 0);
      if (scenario !== 'stock-changed') assert.equal(db.prepare('SELECT available FROM inventory WHERE sku=?').get(input.replacementSku)?.available, stock - (scenario === 'confirm' ? 1 : 0));
      const repeat = await call('decideExchange', { confirmationToken: preview.confirmationToken, decision: decision === 'confirm' ? 'decline' : 'confirm' });
      assert.equal(repeat.status, outcome.status, 'A repeated or conflicting click cannot change a completed decision');
      assert.equal(count(), scenario === 'confirm' ? 1 : 0);
      evidence.push({ scenario, outcome, repeatedStatus: repeat.status });
    }
    console.log(`Passed: ${scenario}`);
  }
} finally {
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await client.disconnect(); db.close(); await mastra.observability.flush(); await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
