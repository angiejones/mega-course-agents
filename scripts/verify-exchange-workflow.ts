import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dir = resolve('data/exchange-workflow', randomUUID()); mkdirSync(dir, { recursive: true });
process.env.STORE_DB_PATH = resolve(dir, 'store.db');
process.env.AGENT_DB_PATH = resolve(dir, 'agent.db');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const db = openExchangeStore(process.env.STORE_DB_PATH); seedExchangeStore(db);
const workflow = mastra.getWorkflow('exchangeWorkflow');
const evidence: object[] = [];
try {
  for (const decision of ['decline', 'confirm'] as const) {
    const run = await workflow.createRun();
    const start = await run.start({ inputData: { orderId: 'order-1001', sku: 'shoe-blue-8', replacementSku: 'shoe-blue-9', quantity: 1, message: 'These squeeze my toes; I need size 9.' } });
    assert.equal(start.status, 'suspended');
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
    const resumed = await run.resume({ step: 'confirm-exchange', resumeData: { decision } });
    assert.equal(resumed.status, 'success');
    if (resumed.status !== 'success') throw new Error('Resume failed');
    assert.equal(resumed.result.status, decision === 'confirm' ? 'committed' : 'declined');
    evidence.push({ decision, runId: run.runId, start, resumed });
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, decision === 'confirm' ? 1 : 0);
  }
  console.log('Live Jev + Mastra workflow passed: suspend, decline without mutation, suspend, confirm exactly one exchange.');
} finally {
  writeFileSync(resolve(dir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${dir}/evidence.json`); db.close(); await mastra.observability.flush();
}
