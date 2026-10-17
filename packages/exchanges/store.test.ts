import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openExchangeStore, seedExchangeStore, checkEligibility, calculateQuote, prepareExchange, recordConfirmation, commitExchange, getInventory, fixtureClock, getProposal } from './store.ts';
const alex = 'customer-alex';
const input = { orderId: 'order-1001', sku: 'shoe-blue-8', replacementSku: 'shoe-blue-9', quantity: 1 };
function setup() { const db = openExchangeStore(':memory:'); seedExchangeStore(db); return db; }
function count(db: ReturnType<typeof setup>) { return Number(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n); }
function approve(db: ReturnType<typeof setup>, orderId = input.orderId) {
  const p = prepareExchange(db, alex, { ...input, orderId });
  recordConfirmation(db, alex, p.requestId, p.fingerprint, true); return p;
}
test('eligibility enforces ownership, dates, final sale, quantity and item identity', () => {
  const db = setup();
  try {
    assert.equal(checkEligibility(db, alex, input).eligible, true);
    assert.equal(checkEligibility(db, alex, { ...input, orderId: 'order-boundary' }).eligible, true);
    for (const [orderId, reason] of [['order-expired', 'window_expired'], ['order-final-sale', 'final_sale'], ['order-future', 'not_delivered'], ['order-1002', 'order_not_found'], ['missing', 'order_not_found']])
      assert.deepEqual(checkEligibility(db, alex, { ...input, orderId }), { eligible: false, reason });
    assert.equal(checkEligibility(db, alex, { ...input, quantity: 2 }).eligible, false);
    assert.deepEqual(checkEligibility(db, alex, { ...input, sku: 'missing' }), { eligible: false, reason: 'item_not_found' });
    assert.throws(() => calculateQuote(db, alex, { ...input, quantity: -1 }));
    assert.throws(() => seedExchangeStore(db), /seed_requires_empty_database/);
  } finally { db.close(); }
});
test('quotes use actual paid amounts and verified inventory', () => {
  const db = setup();
  try {
    assert.equal(calculateQuote(db, alex, input).differenceCents, 0);
    const discounted = calculateQuote(db, alex, { ...input, orderId: 'order-discounted' });
    assert.equal(discounted.creditCents, 5900); assert.equal(discounted.differenceCents, 2000);
    assert.equal(calculateQuote(db, alex, { ...input, replacementSku: 'shoe-sale-9' }).differenceCents, -2000);
    assert.throws(() => calculateQuote(db, alex, { ...input, replacementSku: 'shoe-blue-10' }), /out_of_stock/);
    assert.throws(() => calculateQuote(db, alex, { ...input, replacementSku: 'invented' }), /replacement_not_found/);
  } finally { db.close(); }
});
test('unconfirmed, declined, wrong-customer and changed proposals cannot commit', () => {
  const db = setup();
  try {
    const p = prepareExchange(db, alex, input);
    const before = getInventory(db, input.replacementSku);
    assert.throws(() => commitExchange(db, alex, p.requestId, p.fingerprint), /confirmation_required/);
    assert.throws(() => recordConfirmation(db, 'customer-sam', p.requestId, p.fingerprint, true), /request_not_found/);
    assert.throws(() => recordConfirmation(db, alex, p.requestId, 'changed', true), /proposal_changed/);
    assert.throws(() => prepareExchange(db, alex, { ...input, replacementSku: 'shoe-red-9' }, p.requestId), /request_conflict/);
    recordConfirmation(db, alex, p.requestId, p.fingerprint, false);
    assert.throws(() => commitExchange(db, alex, p.requestId, p.fingerprint), /confirmation_required/);
    assert.equal(count(db), 0); assert.deepEqual(getInventory(db, input.replacementSku), before);
    assert.equal(getProposal(db, alex, p.requestId).state, 'declined');
  } finally { db.close(); }
});
test('commit rechecks stock, price, policy, ownership and expiry without partial mutation', () => {
  const changes = [
    ["UPDATE inventory SET available=0 WHERE sku='shoe-blue-9'", 'out_of_stock'],
    ["UPDATE variants SET payload=json_set(payload,'$.priceCents',8900) WHERE sku='shoe-blue-9'", 'quote_changed'],
    ["UPDATE exchange_policy SET payload=json_set(payload,'$.id','exchange-v2')", 'quote_changed'],
    ["UPDATE orders SET customer_id='customer-sam' WHERE id='order-1001'", 'order_not_found'],
    ["UPDATE orders SET payload=json_set(payload,'$.items[0].finalSale',json('true')) WHERE id='order-1001'", 'final_sale'],
  ];
  for (const [sql, error] of changes) {
    const db = setup();
    try {
      const p = approve(db); db.exec(sql);
      const stock = getInventory(db, input.replacementSku);
      assert.throws(() => commitExchange(db, alex, p.requestId, p.fingerprint), new RegExp(error));
      assert.equal(count(db), 0); assert.deepEqual(getInventory(db, input.replacementSku), stock);
    } finally { db.close(); }
  }
  const db = setup();
  try {
    const p = approve(db);
    assert.throws(() => commitExchange(db, alex, p.requestId, p.fingerprint, '2026-11-03T12:15:00.000Z'), /quote_expired/);
    assert.equal(count(db), 0);
  } finally { db.close(); }
});
test('a lost response can be recovered after reopening; a second request cannot exchange the item twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exchanges-'));
  const path = join(dir, 'store.db');
  let db = openExchangeStore(path);
  try {
    seedExchangeStore(db); const p = approve(db);
    const receipt = commitExchange(db, alex, p.requestId, p.fingerprint);
    db.close(); db = openExchangeStore(path);
    assert.deepEqual(commitExchange(db, alex, p.requestId, p.fingerprint, '2026-12-01T12:00:00.000Z'), receipt);
    assert.equal(count(db), 1);
    const stock = getInventory(db, input.replacementSku);
    assert.ok(stock.found); assert.equal(stock.available, 2);
    assert.throws(() => prepareExchange(db, alex, input), /quantity_unavailable/);
    assert.throws(() => commitExchange(db, 'customer-sam', p.requestId, p.fingerprint), /request_not_found/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('competing approved requests cannot consume the same purchased quantity', () => {
  const db = setup();
  try {
    const a = approve(db), b = approve(db);
    commitExchange(db, alex, a.requestId, a.fingerprint);
    assert.throws(() => commitExchange(db, alex, b.requestId, b.fingerprint), /quantity_unavailable/);
    assert.equal(count(db), 1);
  } finally { db.close(); }
});
test('database failure rolls back stock and the exchange record', () => {
  const db = setup();
  try {
    const p = approve(db); const stock = getInventory(db, input.replacementSku);
    db.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE OF result ON exchange_requests BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;");
    assert.throws(() => commitExchange(db, alex, p.requestId, p.fingerprint), /simulated storage failure/);
    assert.deepEqual(getInventory(db, input.replacementSku), stock); assert.equal(count(db), 0);
    assert.equal(getProposal(db, alex, p.requestId).state, 'approved');
  } finally { db.close(); }
});
