import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { settings } from '../config.ts';
import { openStore, getOrder } from '../store/index.ts';

export const getOrderTool = createTool({
  id: 'get-order',
  description:
    'Retrieve an order by order number for the configured customer. ' +
    'Returns order details only if the order belongs to that customer. ' +
    'Use this tool to verify purchase details before answering order-related questions.',
  inputSchema: z.object({
    orderId: z.string().min(1),
  }),
  outputSchema: z.discriminatedUnion('found', [
    z.object({ found: z.literal(false), message: z.string() }),
    z.object({ found: z.literal(true), order: z.record(z.string(), z.unknown()) }),
  ]),
  execute: async ({ orderId }) => {
    const db = openStore();
    try { return getOrder(db, settings.customerId, orderId); }
    finally { db.close(); }
  },
});
