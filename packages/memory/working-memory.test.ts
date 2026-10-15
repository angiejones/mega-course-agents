import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, seed, getOrder } from '../store/index.ts';
import {
  savePreference, readPreference, resetPreferences,
} from '../store/preferences.ts';
import { retailAgent } from '../../apps/retail/src/mastra/agent.ts';

test('preferences persist, isolate customers, reject order categories, and reset independently', () => {
  const directory = mkdtempSync(join(tmpdir(), 'retail-preferences-'));
  const path = join(directory, 'store.db');
  let db = openStore(path);
  try {
    db.exec("CREATE TABLE preferences (customer_id TEXT PRIMARY KEY, shoe_size TEXT NOT NULL, consent_text TEXT NOT NULL, saved_at TEXT NOT NULL)");
    db.prepare('INSERT INTO preferences VALUES (?, ?, ?, ?)').run('alex', '7', 'old request', '2026-01-01');
    assert.equal(readPreference(db, 'alex', 'shoe_size').found, false);
    seed(db);
    savePreference(db, 'alex', { category: 'shoe_size', value: '9' });
    savePreference(db, 'alex', { category: 'shirt_size', value: 'medium' });
    savePreference(db, 'sam', { category: 'shoe_size', value: '11' });
    assert.throws(() => savePreference(db, 'alex', {
      category: 'order_id', value: 'order-1001',
    } as any));
    db.close();
    db = openStore(path);
    assert.equal(readPreference(db, 'alex', 'shoe_size').value, '9');
    assert.equal(readPreference(db, 'alex', 'shirt_size').value, 'medium');
    assert.equal(readPreference(db, 'sam', 'shoe_size').value, '11');
    savePreference(db, 'alex', { category: 'shoe_size', value: '10' });
    assert.equal(readPreference(db, 'alex', 'shoe_size').value, '10');
    seed(db);
    assert.equal(readPreference(db, 'alex', 'shoe_size').value, '10');
    resetPreferences(db, 'alex');
    assert.equal(readPreference(db, 'alex', 'shoe_size').found, false);
    assert.equal(readPreference(db, 'alex', 'shirt_size').found, false);
    assert.equal(readPreference(db, 'sam', 'shoe_size').value, '11');
    assert.equal(getOrder(db, 'customer-alex', 'order-1001').found, true);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('automatic working-memory tools are disabled', async () => {
  const memory = await retailAgent.getMemory();
  assert.ok(memory);
  assert.equal(memory.listTools().updateWorkingMemory, undefined);
});
