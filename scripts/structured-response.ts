import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { retailResponseSchema } from '../packages/exchanges/response.ts';

const { values } = parseArgs({ options: {
  message: { type: 'string' }, customer: { type: 'string' },
} });
const message = values.message?.trim();
const customerId = values.customer?.trim();
if (!message || !customerId) {
  throw new Error('Provide --customer <customer ID> and --message "<customer message>".');
}
// Simulate the signed-in customer for this isolated command-line run.
process.env.CUSTOMER_ID = customerId;

const directory = resolve('data/structured-response', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const db = openExchangeStore(process.env.STORE_DB_PATH);
seedExchangeStore(db);
const agent = mastra.getAgent('retailAgent');
try {
  const result = await agent.generate(
    message,
    {
      memory: { thread: randomUUID(), resource: customerId },
      structuredOutput: { schema: retailResponseSchema },
    },
  );
  const response = retailResponseSchema.parse(result.object);
  console.log(JSON.stringify(response, null, 2));

  assert.equal(response.exchangeId, null);
  if (response.status === 'awaiting_confirmation') {
    const tool = result.toolResults.find(t => t.payload.toolName === 'exchangeWithConfirmation');
    assert.ok(tool);
    const outcome = tool.payload.result as { status: string; requestId: string; proposal: Record<string, unknown> };
    assert.match(response.message, /1/);
    assert.match(response.message, /2/);
    assert.match(response.message, /confirm/i);
    assert.match(response.message, /decline/i);
    assert.equal(response.status, outcome.status);
    assert.equal(response.requestId, outcome.requestId);
    assert.ok(response.quote);
    for (const key of Object.keys(response.quote) as (keyof typeof response.quote)[]) {
      assert.equal(response.quote[key], outcome.proposal[key], key);
    }
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
  assert.ok(result.steps.length <= 5);
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify({ message, customerId, response, toolResults: result.toolResults, text: result.text, traceId: result.traceId }, null, 2));
  console.log(`Response checks passed. Evidence: ${directory}/evidence.json`);
} finally {
  db.close();
  await mastra.observability.flush();
}
