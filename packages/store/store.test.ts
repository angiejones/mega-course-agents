import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, seed, getOrder } from './index.ts';
test('owned lookup, cross-customer denial, and repeatable reset', () => {
  const db = openStore(':memory:');
  try {
    seed(db);
    const original = getOrder(db, 'customer-alex', 'order-1001');
    assert.equal(original.found, true);
    assert.deepEqual(getOrder(db, 'customer-sam', 'order-1001'), getOrder(db, 'customer-sam', 'missing'));
    db.exec("DELETE FROM orders WHERE id = 'order-1001'");
    assert.equal(getOrder(db, 'customer-alex', 'order-1001').found, false);
    seed(db); assert.deepEqual(getOrder(db, 'customer-alex', 'order-1001'), original);
    seed(db); assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get()?.n, 7);
    assert.equal(getOrder(db, 'customer-alex', 'order-2001').found, true);
    assert.equal(getOrder(db, 'customer-sam', 'order-2001').found, false);
  } finally { db.close(); }
});

import { findProjectRoot } from '../config.ts';
import { resolve } from 'node:path';
test('Studio public directory resolves to the same project root', () => {
  assert.equal(findProjectRoot(resolve('apps/retail/src/mastra/public')), findProjectRoot());
});

