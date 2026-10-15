import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

// Limit durable memory to shopping preferences, not order history.
export const preferenceCategory = z.enum([
  'shoe_size',
  'shirt_size',
  'pants_size',
  'clothing_size',
  'color',
  'style',
  'brand',
  'fit',
]);

export const preferenceInput = z.object({
  category: preferenceCategory,
  value: z.string().trim().min(1).max(100),
});

export function savePreference(
  db: DatabaseSync,
  customerId: string,
  input: z.infer<typeof preferenceInput>,
) {
  const { category, value } = preferenceInput.parse(input);
  db.prepare(
    'INSERT INTO customer_preferences (customer_id, category, value) ' +
      'VALUES (?, ?, ?) ON CONFLICT(customer_id, category) ' +
      'DO UPDATE SET value = excluded.value',
  ).run(customerId, category, value);
  return { saved: true, category, value };
}

export function readPreference(
  db: DatabaseSync,
  customerId: string,
  category: z.infer<typeof preferenceCategory>,
) {
  preferenceCategory.parse(category);
  const row = db.prepare(
    'SELECT value FROM customer_preferences WHERE customer_id = ? AND category = ?',
  ).get(customerId, category);
  return row
    ? { found: true as const, category, value: String(row.value) }
    : { found: false as const, category };
}

export function resetPreferences(db: DatabaseSync, customerId: string) {
  db.prepare('DELETE FROM customer_preferences WHERE customer_id = ?').run(customerId);
}
