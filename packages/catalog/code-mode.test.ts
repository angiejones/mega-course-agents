import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { noopObserve } from '@mastra/core/tools';
import { QuickJsCodeModeTransport } from '@mastra/quickjs';
import { readTripProducts } from './trip-tools.ts';
import { createShoppingCodeMode } from './code-mode.ts';
import { startOrderMcpFixture } from '../../scripts/support/order-mcp-fixture.ts';
import { createOrderClient } from '../mcp/order-client.ts';
let close: () => Promise<void>;
let client: ReturnType<typeof createOrderClient>;
let mode: ReturnType<typeof createShoppingCodeMode>;
before(async () => { close = await startOrderMcpFixture(); client = createOrderClient(); mode = createShoppingCodeMode(await client.listTools()); });
after(async () => { await client.disconnect(); await close(); });
async function run(code: string) { return mode.tool.execute!({ code }, { observe: noopObserve }); }
const load = `const jackets = (await external_orders_searchProducts({category:'rain-jacket'})).products;
const packs = (await external_orders_searchProducts({category:'backpack'})).products;
const rows = (await Promise.all([...jackets,...packs].map(p => external_orders_getProductVariants({productId:p.id})))).flatMap(r => r.variants);`;
const select = `${load}
const pairs = [];
for (const j of rows.filter(r => r.category === 'rain-jacket' && r.size === 'L' && r.stock > 0))
 for (const b of rows.filter(r => r.category === 'backpack' && r.stock > 0))
  if(j.priceCents+b.priceCents < 15000) pairs.push({j,b,total:j.priceCents+b.priceCents});
return pairs.sort((a,b) => a.total-b.total || a.j.sku.localeCompare(b.j.sku) || a.b.sku.localeCompare(b.b.sku))
 .slice(0,3).map(p => ({jacket:p.j,backpack:p.b,totalCents:p.total}));`;
test('real MCP discovery and calls produce cheapest in-stock combinations', async () => {
 const result = await run(select);
 assert.equal(result.success,true);
 assert.deepEqual(result.result.map((r: any) => [r.jacket.sku,r.backpack.sku,r.totalCents]), [
  ['coast-l','daypack-one-size',10800],['coast-l','weekender-one-size',12800],['trail-l','daypack-one-size',12800]]);

});
test('strict budget boundary and impossible budget', async () => {
 assert.deepEqual((await run(select.replace('15000','10000'))).result,[]);
 assert.equal((await run(select.replace('15000','12800'))).result.length,1);
 assert.equal((await run(select.replace('< 15000','<= 12800'))).result.length,3);
});
test('standard transport returns general values without a shopping return contract', async () => {
 for (const value of [42, {count:4, description:'Available products'}, [1,2,3,4]]) {
  const result = await run(`return ${JSON.stringify(value)};`);
  assert.equal(result.success,true);
  assert.deepEqual(result.result,value);
 }
 const result = await run("console.log('progress'); return {done:true};");
 assert.equal(result.success,true);
 assert.ok(JSON.stringify(result.logs).includes('progress'));
});
test('sandbox cannot access host APIs or exchange tools', async () => {
 const result = await new QuickJsCodeModeTransport().run({program:'return [typeof process,typeof require,typeof fetch,typeof external_confirmExchange];',toolIds:[],dispatch:async()=>{throw new Error('Unexpected call');},timeout:1000});
 assert.deepEqual(result.result,['undefined','undefined','undefined','undefined']);
 assert.equal((await run('return await external_confirmExchange({});')).success,false);
});
test('infinite loop is interrupted', {timeout:15000}, async () => { assert.equal((await run('while(true){}')).success,false); });

test('batched MCP variant lookup returns the same records as individual reads', async () => {
 const result = await run(`const result = await external_orders_getProductVariants({productIds:['coast','daypack']});
 if(result.variants.length !== 4) throw new Error('Missing batch records');
 return result.variants;`);
 assert.equal(result.success,true);
 assert.deepEqual(result.result.map((v: any) => v.sku), ['coast-m','coast-l','coast-xl','daypack-one-size']);
 assert.equal((await run(`await external_orders_getProductVariants({productIds:['coast','unknown']}); return [];`)).success,false);
});

test('standard transport reports execution errors', async () => {
 const result = await run("throw new Error('Example execution error');");
 assert.equal(result.success,false);
 assert.match(result.error.message,/Example execution error/);
});

test('one MCP call accepts the full catalog and preserves all variants across internal batches', async () => {
 const previous = process.env.SHOPPING_CATALOG_PATH;
 process.env.SHOPPING_CATALOG_PATH = 'fixtures/catalog/large-trip-products.json';
 try {
  const products = readTripProducts();
  assert.equal(products.length,240);
  const tools = await client.listTools();
  const raw: any = await tools.orders_getProductVariants.execute!({productIds:products.map(p => p.id)}, {observe:noopObserve});
  const data = raw.structuredContent ?? (raw.content?.[0]?.text ? JSON.parse(raw.content[0].text) : raw);
  assert.deepEqual(data.variants, products.flatMap(p => p.variants));
  assert.equal(data.variants.length,720);
  const result = await run(`const products = (await external_orders_searchProducts({category:'rain-jacket'})).products;
    await external_orders_getProductVariants({productIds:[...products.map(p => p.id),'unknown']}); return [];`);
  assert.equal(result.success,false);
  assert.ok(!mode.instructions.includes('at most 50'));
 } finally {
  if (previous === undefined) delete process.env.SHOPPING_CATALOG_PATH;
  else process.env.SHOPPING_CATALOG_PATH = previous;
 }
});
