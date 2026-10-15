import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { settings } from '../config.ts';
import orders from '../../fixtures/orders.json' with { type: 'json' };
export function openStore(path = settings.storePath) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    'CREATE TABLE IF NOT EXISTS orders ' +
      '(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, ' +
      'payload TEXT NOT NULL)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS customer_preferences ' +
      '(customer_id TEXT NOT NULL, category TEXT NOT NULL, ' +
      'value TEXT NOT NULL, PRIMARY KEY (customer_id, category))',
  );
  return db;
}

export function seed(db: DatabaseSync) {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM orders');
    const insert = db.prepare('INSERT INTO orders VALUES (?, ?, ?)');
    for (const order of orders) {
      insert.run(order.id, order.customerId, JSON.stringify(order));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getOrder(
  db: DatabaseSync,
  customerId: string,
  orderId: string,
) {
  // Identity comes from the application session,
  // never from model-supplied tool arguments.
  const row = db
    .prepare(
      'SELECT payload FROM orders WHERE id = ? AND customer_id = ?',
    )
    .get(orderId, customerId);

  if (!row) {
    return {
      found: false as const,
      message: 'Order not found for this customer.',
    };
  }
  return {
    found: true as const,
    order: JSON.parse(String(row.payload)),
  };
}
