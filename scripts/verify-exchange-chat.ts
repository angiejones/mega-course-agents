import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { retailResponseSchema } from '../packages/exchanges/response.ts';
const structured = process.argv.includes('--structured');
const dir = resolve('data/exchange-workflow', randomUUID()); mkdirSync(dir, { recursive: true });
process.env.STORE_DB_PATH = resolve(dir, 'store.db');
process.env.AGENT_DB_PATH = resolve(dir, 'agent.db');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const db = openExchangeStore(process.env.STORE_DB_PATH); seedExchangeStore(db);
const agent = mastra.getAgent('retailAgent');
const evidence: object[] = [];
const conversation = () => ({ thread: randomUUID(), resource: 'customer-alex' });
async function ask(prompt: string, expected: string, memory = conversation()) {
  const result = structured
    ? await agent.generate(prompt, { memory, structuredOutput: { schema: retailResponseSchema } })
    : await agent.generate(prompt, { memory });
  evidence.push({prompt, thread:memory.thread, object:result.object, text:result.text, toolResults:result.toolResults, traceId:result.traceId, steps:result.steps.length});
  writeFileSync(resolve(dir, 'chat-evidence.json'), JSON.stringify(evidence, null, 2));
  if (expected === 'human_review') {
    const tool = result.toolResults.find(t => t.payload.toolName === 'exchangeWithConfirmation');
    assert.ok(tool);
    const outcome = tool.payload.result as { referral: { referralId: string } };
    const review = db.prepare('SELECT * FROM quality_reviews WHERE id = ?').get(outcome.referral.referralId);
    assert.ok(review);
    assert.equal(review.customer_id, 'customer-alex');
    assert.equal(review.department, 'quality');
    assert.equal(review.status, 'pending');
    const message = structured ? retailResponseSchema.parse(result.object).message : result.text;
    assert.match(message, /quality/i);
    assert.match(message, /refer|rout|sent|forward/i);
    assert.doesNotMatch(message, /in stock|available|no exchange|human review/i);
  }
  if (!structured) {
    assert.ok(result.text.trim(), 'Expected a conversational reply');
    assert.doesNotMatch(result.text, /^\s*(?:```json|\{)/, 'Chat must not return raw JSON');
    assert.ok(result.steps.length <= 5);
    const tool = result.toolResults.find(t => ['exchangeWithConfirmation', 'confirmExchange'].includes(t.payload.toolName));
    if (['human_review', 'awaiting_confirmation', 'committed', 'declined'].includes(expected)) {
      assert.ok(tool, 'Expected exchange tool result');
      const output = tool.payload.result as { status: string; requestId?: string };
      assert.equal(output.status, expected);
      if (expected === 'awaiting_confirmation') {
        assert.match(result.text, /confirm/i);
        assert.match(result.text, /decline/i);
        assert.match(result.text, /1/);
        assert.match(result.text, /2/);
        assert.match(result.text, /79/);
      }
      console.log(`${expected}: conversational reply and tool outcome verified`);
      return output;
    }
    if (expected === 'rejected') assert.match(JSON.stringify(result.toolResults), /"found":false/);
    console.log(`${expected}: conversational reply verified`);
    return { status: expected, requestId: undefined };
  }
  const response = retailResponseSchema.parse(result.object);
  assert.equal(response.status, expected);
  assert.ok(result.steps.length <= 5);
  if (expected !== 'committed') assert.equal(response.exchangeId, null);
  if (expected === 'awaiting_confirmation' || expected === 'committed') {
    const tool = result.toolResults.find(t => ['exchangeWithConfirmation','confirmExchange'].includes(t.payload.toolName));
    assert.ok(tool);
    const output = tool.payload.result as {requestId: string;proposal?:Record<string,unknown>;receipt?:Record<string,unknown>};
    assert.equal(response.requestId, output.requestId);
    const source = output.proposal ?? output.receipt;
    assert.ok(source && response.quote);
    for (const key of Object.keys(response.quote) as (keyof NonNullable<typeof response.quote>)[]) assert.equal(response.quote[key], source[key], key);
    if (expected === 'committed') assert.equal(response.exchangeId, source.exchangeId);
  }
  console.log(`${expected}: validated final response`);
  return response;
}
try {
  await ask('Can I exchange my shoes?', 'clarify');
  await ask('Look up order-1002.', 'rejected');
  await ask('The blue shoes in order-1001 arrived with the sole torn off. I want size 9 instead.', 'human_review');
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
  for (const decision of ['decline', 'confirm'] as const) {
    const memory = conversation();
    const proposal = await ask('The blue shoes in order-1001 squeeze my toes. Can I exchange them for size 9?', 'awaiting_confirmation', memory);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
    const result = await ask(decision === 'confirm' ? '1' : '2', decision === 'confirm' ? 'committed' : 'declined', memory);
    assert.equal(result.requestId, proposal.requestId);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchange_requests WHERE state = ?').get(decision === 'confirm' ? 'committed' : 'declined')?.n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, decision === 'confirm' ? 1 : 0);
  }
} finally {
  console.log(`Evidence: ${dir}/chat-evidence.json`); db.close(); await mastra.observability.flush();
}
