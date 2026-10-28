import { serviceDescriptions } from "../packages/collaboration/service-descriptions.ts";
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory=resolve('data/collaboration-progression',randomUUID());
mkdirSync(directory,{recursive:true});
process.env.STORE_DB_PATH=resolve(directory,'store.db');
process.env.AGENT_DB_PATH=resolve(directory,'agent.db');
process.env.RESOLUTION_DB_PATH=resolve(directory,'resolution.db');
const {openExchangeStore,seedExchangeStore}=await import('../packages/exchanges/store.ts');
const store=openExchangeStore(process.env.STORE_DB_PATH);seedExchangeStore(store);store.close();
const {startOrderMcpFixture}=await import('./support/order-mcp-fixture.ts');
const closeMcp=await startOrderMcpFixture();
const {resolutionTools}=await import('../packages/collaboration/tools.ts');
const {mastra}=await import('../apps/retail/src/mastra/index.ts');
const {createAgentService}=await import('../packages/collaboration/transport.ts');
const {database,read}=await import('../packages/collaboration/storage.ts');
const {investigate}=await import('../agents/delivery/src/service.ts');
const {supplierRunner}=await import('../agents/supplier/src/service.ts');
const {shoppingAgent}=await import('../agents/shopping/src/agent.ts');
const {contactRetailer}=await import('../agents/shopping/src/contact-retailer.ts');
shoppingAgent.__setTools({});
assert.deepEqual(Object.keys(await shoppingAgent.listTools()),[], 'Shopping starts without a retailer connection');
const services:ReturnType<typeof createAgentService>[]=[];
const supplierDb=database(resolve(directory,'supplier.db'));
const stateDb=database(process.env.RESOLUTION_DB_PATH);
const agent=mastra.getAgent('retailAgent');
agent.__setTools(Object.fromEntries(
  Object.entries(await agent.listTools()).filter(([name]) => !(name in resolutionTools)),
));
assert.deepEqual(Object.keys(await agent.listTools()).filter(name => name in resolutionTools), [], 'The isolated retail starter must have no collaboration tools');
const registered: Array<keyof typeof resolutionTools> = [];
const thread=`progression-${randomUUID()}`;
const evidence:unknown[]=[];
const state=()=>read<any>(stateDb,JSON.stringify(['resolution','customer-alex',thread]),'active');
const reservations=()=>supplierDb.prepare("SELECT count(*) AS n FROM records WHERE scope='reservation'").get()!.n;
async function add(names: Array<keyof typeof resolutionTools>) {
  // Test-only mutation: recording adds these same properties directly in agent.ts.
  const current = await agent.listTools();
  for (const name of names) { current[name] = resolutionTools[name]; registered.push(name); }
  agent.__setTools(current);
  const visible=Object.keys(await agent.listTools());
  assert.deepEqual(visible.filter(k=>k in resolutionTools).sort(),[...registered].sort());
  evidence.push({registered:[...registered]});
}
async function turn(label:string,message:string) {
  const result=await agent.generate(message,{memory:{thread,resource:'customer-alex'},abortSignal:AbortSignal.timeout(210000)});
  evidence.push({label,message,text:result.text,toolCalls:result.toolCalls,toolResults:result.toolResults,state:state()});
  writeFileSync(resolve(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  return result;
}
async function start(name:string,skill:string,run:Parameters<typeof createAgentService>[0]['run']) {
  const token=randomBytes(32).toString('hex');
  const service=createAgentService({name,...serviceDescriptions[skill],skill,run,owner:'retail-service',token,url:'http://127.0.0.1:0/a2a',path:resolve(directory,`${skill}.db`)});
  services.push(service);
  await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));
  const address=service.server.address();assert(address&&typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}`;service.card.supportedInterfaces[0].url=url+'/a2a';
  return {url,token};
}
try {
  await add([]);
  const deadline=new Date(Date.now()+72*3600000).toISOString();
  await turn('Lookup only',`My shoes in order-2001 say delivered, but they're missing. I need shoes for a wedding by ${deadline}. Size 9, maximum price $99. I prefer formal black shoes with cushioning, but I'm open to something similar.`);
  assert.equal(state(),undefined); assert.equal(services.length,0);
  console.log('Passed: lookup-only agent has no delegation tools and starts no investigation.');
  const shipping=await start('Shipping investigation','delivery-investigation',investigate);
  process.env.CARRIER_URL=shipping.url;process.env.CARRIER_TOKEN=shipping.token;
  await add(['investigateMissingDelivery','getResolution']);
  await turn('Add investigation','Please investigate whether the missing parcel can be recovered before my deadline.');
  assert.equal(state().phase,'awaiting_clarification');
  const firstTask=state().delivery.taskId;
  assert.equal(services.length,1);
  console.log('Passed: first delegation occurs only after adding its tools and service.');
  await add(['clarifyDelivery']);
  await turn('Add clarification','My address is a detached house with no reception desk. The adjacent office is not my address, and nobody there is authorized to accept parcels for me.');
  assert.equal(state().phase,'ready_to_source');assert.equal(state().delivery.taskId,firstTask);
  assert.equal(state().supplier,undefined);
  const supplier=await start('Supplier sourcing','product-sourcing',supplierRunner(supplierDb));
  process.env.SUPPLIER_URL=supplier.url;process.env.SUPPLIER_TOKEN=supplier.token;
  await add(['sourceReplacement','reviseReplacementSearch']);
  await turn('Add sourcing','Please find replacement options within my size, budget and deadline.');
  assert.equal(state().phase,'options_sourced');assert.equal(state().comparisons,undefined);assert.equal(state().proposal,undefined);
  assert.equal(reservations(),0);
  console.log('Passed: supplier offers are separate from helpers and proposal tools.');
  await add(['compareReplacementOptions']);
  await turn('Add comparisons','Please assess those options against my requirements and preferences.');
  assert.equal(state().phase,'options_ready');assert(state().comparisons.results.length>0);assert.equal(state().proposal,undefined);
  await add(['proposeReplacement','confirmReplacement']);
  const selected=state().comparisons.results.find((r:any)=>r.assessment?.suitable);assert(selected);
  const option=state().options.find((c:any)=>c.sku===selected.sku);
  await turn('Add proposal',`I'd like the ${option.name}. Show me the exact proposal before reserving it.`);
  assert.equal(state().phase,'awaiting_confirmation');assert.equal(reservations(),0);
  await turn('Separate confirmation','1');
  assert.equal(state().phase,'committed');assert.equal(reservations(),1);
  assert.deepEqual(Object.keys(await shoppingAgent.listTools()),[]);
  shoppingAgent.__setTools({contactRetailer});
  assert.deepEqual(Object.keys(await shoppingAgent.listTools()),['contactRetailer']);
  console.log(`Passed: separate comparison, proposal, confirmation and shopping registration. Evidence: ${directory}/evidence.json`);
} finally {
  for(const service of services.reverse()){service.server.closeAllConnections();await service.close();}
  stateDb.close();supplierDb.close();await closeMcp();await mastra.observability.flush();
}
