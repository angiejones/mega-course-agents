import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { settings, findProjectRoot } from '../config.ts';
import { openStore, getOrder } from '../store/index.ts';
const item = z.object({ sku: z.string(), quantity: z.number().int().positive() });
const shipment = z.object({ shipmentId: z.string(), items: z.array(item), trackingId: z.string().nullable() });
const tracking = z.object({ trackingId: z.string(), status: z.enum(['in_transit', 'delivered']), latestEvent: z.string(), estimatedDelivery: z.string().nullable() });
const supportCase = z.object({ caseId: z.string(), sku: z.string(), status: z.string(), team: z.string(), summary: z.string(), nextAction: z.string() });
const records = z.array(z.object({ orderId: z.string(), shipments: z.array(shipment), tracking: z.array(tracking), cases: z.array(supportCase) }));
function readRecords() { return records.parse(JSON.parse(readFileSync(resolve(findProjectRoot(), 'fixtures/fulfillment.json'), 'utf8'))); }
function ownsOrder(orderId: string) {
    const db = openStore();
    try {
        return getOrder(db, settings.customerId, orderId).found;
    }
    finally {
        db.close();
    }
}
const missing = { found: false as const, message: 'Record not found for this customer.' };
const notFound = z.object({ found: z.literal(false), message: z.string() });
export const getShipmentsTool = createTool({
    id: 'getShipments',
    description: 'Read shipment records for an order belonging to the configured customer. Each record maps item SKUs and quantities to a shipment and tracking ID. A null tracking ID means no carrier tracking has been assigned.',
    inputSchema: z.object({ orderId: z.string().min(1) }).strict(),
    outputSchema: z.union([notFound, z.object({ found: z.literal(true), shipments: z.array(shipment) })]),
    execute: async ({ orderId }) => {
        if (!ownsOrder(orderId))
            return missing;
        const record = readRecords().find(r => r.orderId === orderId);
        return record ? { found: true as const, shipments: record.shipments } : missing;
    },
});
export const getTrackingTool = createTool({
    id: 'getTracking',
    description: 'Read carrier status, latest event and estimated delivery for a tracking ID. Returns data only when its order belongs to the configured customer. The estimate is not a delivery guarantee.',
    inputSchema: z.object({ trackingId: z.string().min(1) }).strict(),
    outputSchema: z.union([notFound, z.object({ found: z.literal(true), tracking })]),
    execute: async ({ trackingId }) => {
        const record = readRecords().find(r => r.tracking.some(t => t.trackingId === trackingId));
        if (!record || !ownsOrder(record.orderId))
            return missing;
        return { found: true as const, tracking: record.tracking.find(t => t.trackingId === trackingId)! };
    },
});
export const getSupportCasesTool = createTool({
    id: 'getSupportCases',
    description: 'Read existing support cases for an order belonging to the configured customer. Returns the affected item SKU, case status, owning team and recorded next action. This tool does not create or update cases.',
    inputSchema: z.object({ orderId: z.string().min(1) }).strict(),
    outputSchema: z.union([notFound, z.object({ found: z.literal(true), cases: z.array(supportCase) })]),
    execute: async ({ orderId }) => {
        if (!ownsOrder(orderId))
            return missing;
        return { found: true as const, cases: readRecords().find(r => r.orderId === orderId)?.cases ?? [] };
    },
});
