import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openExchangeStore, seedExchangeStore, prepareExchange, recordConfirmation, commitExchange, getInventory, checkEligibility } from '../packages/exchanges/store.ts';
import { prepareExchangeFlow } from '../packages/exchanges/flow.ts';
import type { Decision } from '../packages/jev/client.ts';
mkdirSync(resolve('data/exchange-services'), { recursive: true });
const directory = mkdtempSync(resolve('data/exchange-services/run-'));
const db = openExchangeStore(resolve(directory, 'store.db'));
const input = { orderId: 'order-1001', sku: 'jacket-blue-m', replacementSku: 'jacket-blue-l', quantity: 1 };
const evidence: object[] = [];
try {
  seedExchangeStore(db);
  const decision: Decision = { model: 'OFFLINE TEST DOUBLE, NOT JEV OUTPUT', answers: { issue: {
    type: 'choice', choice: 'fit_preference', confidence: 0.95,
    probabilities: { fit_preference: 1, product_problem: 0, unclear: 0 },
  } }, usage: { input_tokens: 0, output_tokens: 0 } };
  const pending = await prepareExchangeFlow(db, 'customer-alex', input, 'These feel tight across my shoulders; I need size L.', async () => decision);
  assert.equal(pending.status, 'awaiting_confirmation');
  if (pending.status !== 'awaiting_confirmation') throw new Error('Expected proposal');
  assert.throws(() => commitExchange(db, 'customer-alex', pending.requestId, pending.fingerprint), /confirmation_required/);
  evidence.push({ check: 'unconfirmed', passed: true, result: pending });
  recordConfirmation(db, 'customer-alex', pending.requestId, pending.fingerprint, false);
  const before = getInventory(db, input.replacementSku);
  assert.throws(() => commitExchange(db, 'customer-alex', pending.requestId, pending.fingerprint), /confirmation_required/);
  assert.deepEqual(getInventory(db, input.replacementSku), before);
  evidence.push({ check: 'declined', passed: true });
  const rejection = checkEligibility(db, 'customer-alex', { ...input, orderId: 'order-expired' });
  assert.equal(rejection.eligible, false); evidence.push({ check: 'policy_rejection', passed: true, result: rejection });
  const approved = prepareExchange(db, 'customer-alex', input);
  recordConfirmation(db, 'customer-alex', approved.requestId, approved.fingerprint, true);
  const receipt = commitExchange(db, 'customer-alex', approved.requestId, approved.fingerprint);
  // Discard the response, then retry the same request.
  assert.deepEqual(commitExchange(db, 'customer-alex', approved.requestId, approved.fingerprint), receipt);
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 1);
  evidence.push({ check: 'committed_once_after_retry', passed: true, result: receipt, inventory: getInventory(db, input.replacementSku) });
  console.log('All four offline service rehearsal checks passed. Decision output is an explicit test double.');
} finally {
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${resolve(directory, 'evidence.json')}`); db.close();
}
