import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openStore, getOrder, seed } from '../store/index.ts';
import fixturePolicy from '../../fixtures/exchanges/policy.json' with { type: 'json' };
import variants from '../../fixtures/exchanges/variants.json' with { type: 'json' };

export const fixtureClock = fixturePolicy.clock;
const cents = z.number().int().nonnegative().max(1_000_000);
const policySchema = z.object({ id: z.string(), windowDays: z.number().int().nonnegative(), quoteMinutes: z.number().int().positive(), feeCents: cents, currency: z.literal('USD') });
export const exchangeInput = z.object({
  orderId: z.string().min(1), sku: z.string().min(1),
  replacementSku: z.string().min(1), quantity: z.number().int().min(1).max(10),
});
export type ExchangeInput = z.infer<typeof exchangeInput>;
export class ExchangeError extends Error {
  constructor(public code: string) { super(code); }
}
function fail(code: string): never { throw new ExchangeError(code); }
function instant(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail('invalid_clock');
  return time;
}
function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function openExchangeStore(path: string) {
  const db = openStore(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS quality_reviews (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, order_id TEXT NOT NULL, sku TEXT NOT NULL,
      replacement_sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
      customer_message TEXT NOT NULL, department TEXT NOT NULL CHECK(department = 'quality'),
      status TEXT NOT NULL CHECK(status IN ('pending', 'closed')), created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pending_quality_review
      ON quality_reviews(customer_id, order_id, sku) WHERE status = 'pending';
    CREATE TABLE IF NOT EXISTS exchange_policy (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS variants (sku TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory (sku TEXT PRIMARY KEY REFERENCES variants(sku), available INTEGER NOT NULL CHECK(available>=0));
    CREATE TABLE IF NOT EXISTS exchange_requests (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      proposal TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','approved','declined','committed')),
      approved_fingerprint TEXT, decided_at TEXT, result TEXT
    );
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES exchange_requests(id),
      customer_id TEXT NOT NULL, order_id TEXT NOT NULL, sku TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity>0), payload TEXT NOT NULL
    );
  `);
  return db;
}

// Only a new, empty database can be initialized. Never reset an existing store.
export function seedExchangeStore(db: DatabaseSync) {
  for (const table of ['quality_reviews', 'orders', 'customer_preferences', 'variants', 'inventory', 'exchange_requests', 'exchanges', 'exchange_policy']) {
    if (Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)) fail('seed_requires_empty_database');
  }
  seed(db);
  transaction(db, () => {
    db.prepare('INSERT INTO exchange_policy VALUES (1, ?)').run(JSON.stringify(fixturePolicy));
    for (const variant of variants) {
      const { stock, ...product } = variant;
      db.prepare('INSERT INTO variants VALUES (?, ?)').run(variant.sku, JSON.stringify(product));
      db.prepare('INSERT INTO inventory VALUES (?, ?)').run(variant.sku, stock);
    }
    const original = getOrder(db, 'customer-alex', 'order-1001');
    if (!original.found) fail('fixture_missing');
    for (const [id, deliveredAt, paidCents, finalSale] of [
      ['order-expired', '2026-10-03', 7900, false],
      ['order-boundary', '2026-10-04', 7900, false],
      ['order-final-sale', '2026-10-25', 7900, true],
      ['order-discounted', '2026-10-25', 5900, false],
      ['order-future', '2026-11-04', 7900, false],
    ] as const) {
      const order = { ...original.order, id, deliveredAt, items: [{ ...original.order.items[0], paidCents, originalPriceCents: 7900, discountCents: 7900 - paidCents, finalSale }] };
      db.prepare('INSERT INTO orders VALUES (?, ?, ?)').run(id, order.customerId, JSON.stringify(order));
    }
  });
}
export function policy(db: DatabaseSync) {
  const row = db.prepare('SELECT payload FROM exchange_policy WHERE singleton=1').get();
  if (!row) fail('policy_missing');
  return policySchema.parse(JSON.parse(String(row.payload)));
}
export function getInventory(db: DatabaseSync, sku: string) {
  const row = db.prepare('SELECT v.payload, i.available FROM variants v JOIN inventory i ON v.sku=i.sku WHERE v.sku=?').get(sku);
  if (!row) return { found: false as const };
  return { found: true as const, variant: JSON.parse(String(row.payload)) as Omit<typeof variants[number], 'stock'>, available: Number(row.available) };
}
const itemSchema = z.object({ sku: z.string(), quantity: z.number().int().positive(), paidCents: cents, currency: z.literal('USD'), finalSale: z.boolean().optional() });
function eligibleItem(db: DatabaseSync, customerId: string, input: ExchangeInput, now: string) {
  const result = getOrder(db, customerId, input.orderId);
  if (!result.found) fail('order_not_found');
  const order = result.order;
  if (order.status !== 'delivered') fail('not_delivered');
  const candidate = order.items.find((i: {sku: string}) => i.sku === input.sku);
  if (!candidate) fail('item_not_found');
  const item = itemSchema.parse(candidate);
  const rules = policy(db);
  // Calendar days in UTC, including the boundary day, independent of wall time.
  const days = Math.floor(instant(now) / 86400000) - Math.floor(instant(order.deliveredAt) / 86400000);
  if (days < 0) fail('not_delivered');
  if (days > rules.windowDays) fail('window_expired');
  if (item.finalSale) fail('final_sale');
  const exchanged = Number(db.prepare('SELECT COALESCE(sum(quantity),0) AS n FROM exchanges WHERE customer_id=? AND order_id=? AND sku=?').get(customerId, input.orderId, input.sku)?.n);
  if (input.quantity > item.quantity - exchanged) fail('quantity_unavailable');
  return { item, rules };
}
export function checkEligibility(db: DatabaseSync, customerId: string, raw: ExchangeInput, now = fixtureClock) {
  try { const input = exchangeInput.parse(raw); const { rules } = eligibleItem(db, customerId, input, now); return { eligible: true as const, policyId: rules.id }; }
  catch (error) {
    if (error instanceof ExchangeError) return { eligible: false as const, reason: error.code };
    throw error;
  }
}
export function calculateQuote(db: DatabaseSync, customerId: string, raw: ExchangeInput, now = fixtureClock) {
  const input = exchangeInput.parse(raw);
  const { item, rules } = eligibleItem(db, customerId, input, now);
  const stock = getInventory(db, input.replacementSku);
  if (!stock.found) fail('replacement_not_found');
  if (input.sku === input.replacementSku) fail('replacement_unchanged');
  if (stock.available < input.quantity) fail('out_of_stock');
  if (stock.variant.currency !== item.currency) fail('currency_mismatch');
  const replacementUnitCents = cents.parse(stock.variant.priceCents);
  const creditCents = item.paidCents * input.quantity;
  const replacementCents = replacementUnitCents * input.quantity;
  return { ...input, policyId: rules.id, currency: item.currency, creditCents, replacementCents,
    feeCents: rules.feeCents, differenceCents: replacementCents + rules.feeCents - creditCents };
}
export type Proposal = ReturnType<typeof calculateQuote> & { customerId: string; expiresAt: string };
function fingerprint(proposal: Proposal) { return createHash('sha256').update(JSON.stringify(proposal)).digest('hex'); }
function request(db: DatabaseSync, customerId: string, id: string) {
  const row = db.prepare('SELECT * FROM exchange_requests WHERE id=? AND customer_id=?').get(id, customerId);
  if (!row) fail('request_not_found');
  return { fingerprint: String(row.fingerprint), state: String(row.state), approved_fingerprint: row.approved_fingerprint, result: row.result, proposal: JSON.parse(String(row.proposal)) as Proposal };
}
export function getProposal(db: DatabaseSync, customerId: string, id: string) {
  const row = request(db, customerId, id);
  return { requestId: id, fingerprint: String(row.fingerprint), state: String(row.state), proposal: row.proposal };
}
export function prepareExchange(db: DatabaseSync, customerId: string, raw: ExchangeInput, requestId: string = randomUUID(), now = fixtureClock) {
  const input = exchangeInput.parse(raw);
  z.string().min(1).max(100).parse(requestId);
  return transaction(db, () => {
    const existing = db.prepare('SELECT customer_id FROM exchange_requests WHERE id=?').get(requestId);
    if (existing) {
      if (existing.customer_id !== customerId) fail('request_conflict');
      const saved = getProposal(db, customerId, requestId);
      if (Object.keys(input).some(key => input[key as keyof ExchangeInput] !== saved.proposal[key as keyof ExchangeInput])) fail('request_conflict');
      return saved;
    }
    const quote = calculateQuote(db, customerId, input, now);
    const proposal: Proposal = { ...quote, customerId, expiresAt: new Date(instant(now) + policy(db).quoteMinutes * 60000).toISOString() };
    db.prepare('INSERT INTO exchange_requests (id,customer_id,fingerprint,proposal,state) VALUES (?,?,?,?,?)')
      .run(requestId, customerId, fingerprint(proposal), JSON.stringify(proposal), 'draft');
    return getProposal(db, customerId, requestId);
  });
}
// Call only from a trusted customer interaction. Do not expose approval as an LLM tool.
export function recordConfirmation(db: DatabaseSync, customerId: string, requestId: string, expectedFingerprint: string, approved: boolean, now = fixtureClock) {
  z.boolean().parse(approved);
  return transaction(db, () => {
    const row = request(db, customerId, requestId);
    if (row.fingerprint !== expectedFingerprint) fail('proposal_changed');
    if (row.state !== 'draft') fail('request_not_pending');
    if (instant(now) >= instant(row.proposal.expiresAt)) fail('quote_expired');
    db.prepare('UPDATE exchange_requests SET state=?, approved_fingerprint=?, decided_at=? WHERE id=?')
      .run(approved ? 'approved' : 'declined', approved ? expectedFingerprint : null, now, requestId);
    return { state: approved ? 'approved' as const : 'declined' as const };
  });
}
export function commitExchange(db: DatabaseSync, customerId: string, requestId: string, expectedFingerprint: string, now = fixtureClock) {
  return transaction(db, () => {
    const row = request(db, customerId, requestId);
    if (row.fingerprint !== expectedFingerprint || fingerprint(row.proposal) !== expectedFingerprint) fail('proposal_changed');
    // A retry recovers the committed receipt even after the quote expires.
    if (row.state === 'committed') return JSON.parse(String(row.result));
    if (row.state !== 'approved' || row.approved_fingerprint !== expectedFingerprint) fail('confirmation_required');
    if (instant(now) >= instant(row.proposal.expiresAt)) fail('quote_expired');
    const current = calculateQuote(db, customerId, row.proposal, now);
    for (const key of Object.keys(current) as (keyof typeof current)[]) {
      if (current[key] !== row.proposal[key]) fail('quote_changed');
    }
    const updated = db.prepare('UPDATE inventory SET available=available-? WHERE sku=? AND available>=?')
      .run(current.quantity, current.replacementSku, current.quantity);
    if (updated.changes !== 1) fail('out_of_stock');
    const result = { exchangeId: randomUUID(), requestId, status: 'committed', ...current,
      paymentStatus: 'not_processed', returnStatus: 'awaiting_return' };
    db.prepare('INSERT INTO exchanges VALUES (?,?,?,?,?,?,?)').run(result.exchangeId, requestId, customerId, current.orderId, current.sku, current.quantity, JSON.stringify(result));
    db.prepare("UPDATE exchange_requests SET state='committed', result=? WHERE id=?").run(JSON.stringify(result), requestId);
    return result;
  });
}
