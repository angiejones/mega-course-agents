import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openExchangeStore } from './store.ts';
import { settings } from '../config.ts';
export const inventoryTool = createTool({
  id: 'get-inventory', description: 'Find verified replacement variants by size and color. Returns actual SKUs, prices and available quantities. Do not invent a SKU.',
  inputSchema: z.object({ size: z.string().optional(), color: z.string().optional() }),
  execute: async ({ size, color }) => {
    const db = openExchangeStore(settings.storePath);
    try { return db.prepare('SELECT v.payload,i.available FROM variants v JOIN inventory i ON v.sku=i.sku').all()
      .map(row => ({ ...JSON.parse(String(row.payload)), available: Number(row.available) }))
      .filter(variant => (!size || variant.size === size) && (!color || variant.color === color));
    } finally { db.close(); }
  },
});
