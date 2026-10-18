import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noopObserve } from '@mastra/core/tools';
const directory = mkdtempSync(join(tmpdir(), 'retail-fulfillment-'));
process.env.STORE_DB_PATH = join(directory, 'store.db');
const { settings } = await import('../config.ts');
const { openExchangeStore, seedExchangeStore } = await import('../exchanges/store.ts');
const { getShipmentsTool, getTrackingTool, getSupportCasesTool } = await import('./tools.ts');
const db = openExchangeStore(settings.storePath);
before(() => seedExchangeStore(db));
after(() => db.close());
const execute = async (tool: any, args: object) => tool.execute(args, { observe: noopObserve });
test('shipment maps each item to the correct tracking and leaves unshipped item without tracking', async () => {
    const result = await execute(getShipmentsTool, { orderId: 'order-1004' });
    const jacket = result.shipments.find((s: any) => s.items.some((i: any) => i.sku === 'rain-jacket-navy-l'));
    assert.equal(jacket.trackingId, 'track-1004-jacket');
    assert.equal((await execute(getTrackingTool, { trackingId: jacket.trackingId })).tracking.status, 'in_transit');
    assert.equal((await execute(getTrackingTool, { trackingId: 'track-1004-pack' })).tracking.status, 'delivered');
    const unshipped = await execute(getShipmentsTool, { orderId: 'order-1006' });
    assert.equal(unshipped.shipments.find((s: any) => s.shipmentId === 'ship-1006-jacket').trackingId, null);
});
test('existing delivery and fulfillment cases are readable without creating new records', async () => {
    assert.equal((await execute(getSupportCasesTool, { orderId: 'order-1005' })).cases[0].caseId, 'case-1005');
    assert.equal((await execute(getSupportCasesTool, { orderId: 'order-1006' })).cases[0].team, 'fulfillment');
    assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
});
test('all read tools enforce customer ownership, including direct tracking IDs', async () => {
    const previous = settings.customerId;
    settings.customerId = 'customer-sam';
    try {
        for (const [tool, args] of [[getShipmentsTool, { orderId: 'order-1004' }], [getTrackingTool, { trackingId: 'track-1004-jacket' }], [getSupportCasesTool, { orderId: 'order-1005' }]] as const) {
            const result = await execute(tool, args);
            assert.equal(result.found, false);
            assert.ok(!JSON.stringify(result).includes('rain-jacket'));
        }
    }
    finally {
        settings.customerId = previous;
    }
});
