import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { getOrder } from '../store/index.ts';
import { ExchangeError, type ExchangeInput } from './store.ts';

export function referToQualityReview(db: DatabaseSync, customerId: string, input: ExchangeInput, message: string, now: string) {
  const order = getOrder(db, customerId, input.orderId);
  if (!order.found) throw new ExchangeError('order_not_found');
  if (!order.order.items.some((item: { sku: string }) => item.sku === input.sku)) throw new ExchangeError('item_not_found');
  db.prepare(`INSERT INTO quality_reviews
    (id, customer_id, order_id, sku, replacement_sku, quantity, customer_message, department, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'quality', 'pending', ?)
    ON CONFLICT(customer_id, order_id, sku) WHERE status = 'pending' DO NOTHING`)
    .run(randomUUID(), customerId, input.orderId, input.sku, input.replacementSku, input.quantity, message, now);
  const review = db.prepare(`SELECT id FROM quality_reviews
    WHERE customer_id = ? AND order_id = ? AND sku = ? AND status = 'pending'`)
    .get(customerId, input.orderId, input.sku)!;
  return { referralId: String(review.id), department: 'quality' as const, status: 'pending' as const };
}
