import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openExchangeStore, seedExchangeStore } from './store.ts';
import { prepareExchangeFlow } from './flow.ts';
import type { Decision } from '../jev/client.ts';
const input = { orderId: 'order-1001', sku: 'shoe-blue-8', replacementSku: 'shoe-blue-9', quantity: 1 };
function fixture(choice: 'fit_preference' | 'product_problem' | 'unclear'): Decision {
  return { model: 'explicit-offline-test-double', answers: { issue: { type: 'choice', choice, confidence: 0.95,
    probabilities: { fit_preference: choice === 'fit_preference' ? 1 : 0, product_problem: choice === 'product_problem' ? 1 : 0, unclear: choice === 'unclear' ? 1 : 0 } } }, usage: { input_tokens: 0, output_tokens: 0 } };
}
test('classification selects a branch; only the routine branch prepares a proposal', async () => {
  for (const [choice, status] of [['fit_preference', 'awaiting_confirmation'], ['product_problem', 'human_review'], ['unclear', 'clarify']] as const) {
    const db = openExchangeStore(':memory:');
    try {
      seedExchangeStore(db);
      const result = await prepareExchangeFlow(db, 'customer-alex', input, 'fictional message', async () => fixture(choice));
      assert.equal(result.status, status);
      assert.equal(db.prepare('SELECT count(*) AS n FROM quality_reviews').get()?.n, choice === 'product_problem' ? 1 : 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM exchange_requests').get()?.n, choice === 'fit_preference' ? 1 : 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
    } finally { db.close(); }
  }
});
test('unauthorized requests and decision failures cannot prepare or commit exchanges', async () => {
  const db = openExchangeStore(':memory:');
  try {
    seedExchangeStore(db);
    const result = await prepareExchangeFlow(db, 'customer-sam', input, 'test', async () => { throw new Error('must not call'); });
    assert.deepEqual(result, { status: 'rejected', reason: 'order_not_found' });
    await assert.rejects(prepareExchangeFlow(db, 'customer-alex', input, 'test', async () => { throw new Error('unavailable'); }), /unavailable/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchange_requests').get()?.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM quality_reviews').get()?.n, 0);
  } finally { db.close(); }
});

test('product problems save a quality referral, reuse it on retry, and leave inventory unchanged', async () => {
  const db = openExchangeStore(':memory:');
  try {
    seedExchangeStore(db);
    const stock = db.prepare('SELECT * FROM inventory ORDER BY sku').all();
    const run = () => prepareExchangeFlow(db, 'customer-alex', input, 'The sole arrived torn.', async () => fixture('product_problem'));
    const first = await run();
    const retry = await run();
    assert.equal(first.status, 'human_review');
    assert.equal(retry.status, 'human_review');
    if (first.status !== 'human_review' || retry.status !== 'human_review') throw new Error('Expected referral');
    assert.deepEqual(retry.referral, first.referral);
    const rows = db.prepare('SELECT * FROM quality_reviews').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, first.referral.referralId);
    assert.equal(rows[0]?.customer_message, 'The sole arrived torn.');
    assert.equal(rows[0]?.customer_id, 'customer-alex');
    assert.equal(rows[0]?.replacement_sku, 'shoe-blue-9');
    assert.equal(rows[0]?.department, 'quality');
    assert.equal(rows[0]?.status, 'pending');
    assert.deepEqual(db.prepare('SELECT * FROM inventory ORDER BY sku').all(), stock);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchange_requests').get()?.n, 0);
  } finally { db.close(); }
});
