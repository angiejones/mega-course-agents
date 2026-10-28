import { serviceDescriptions } from "../packages/collaboration/service-descriptions.ts";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve("data/agent-delegation-verification", randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, "store.db");
process.env.AGENT_DB_PATH = resolve(directory, "agent.db");
process.env.RESOLUTION_DB_PATH = resolve(directory, "resolutions.db");
process.env.SHOPPING_AGENT_DB_PATH = resolve(directory, "shopping-agent.db");
process.env.SHOPPING_DELEGATION_DB_PATH = resolve(directory, "shopping-delegations.db");
const { registerCompletedCollaboration } = await import('./support/completed-collaboration.ts');
const { openExchangeStore, seedExchangeStore } = await import(
  "../packages/exchanges/store.ts"
);
const store = openExchangeStore(process.env.STORE_DB_PATH);
seedExchangeStore(store);
store.close();
const { startOrderMcpFixture } = await import("./support/order-mcp-fixture.ts");
const closeMcp = await startOrderMcpFixture();
const { createAgentService } = await import(
  "../packages/collaboration/transport.ts"
);
const { database, read } = await import("../packages/collaboration/storage.ts");
const { investigate } = await import("../agents/delivery/src/service.ts");
const { supplierRunner } = await import("../agents/supplier/src/service.ts");
const { SpecialistClient } = await import(
  "../packages/collaboration/client.ts"
);
const { retailRunner } = await import("../packages/collaboration/retail.ts");
const operations = database(resolve(directory, "supplier.db"));
const services: ReturnType<typeof createAgentService>[] = [];
const evidence: unknown[] = [];
async function start(
  name: string,
  skill: string,
  run: Parameters<typeof createAgentService>[0]["run"],
  owner: string,
) {
  const token = randomBytes(32).toString("hex");
  const service = createAgentService({
    name,
    ...serviceDescriptions[skill],
    skill,
    run,
    owner,
    url: "http://127.0.0.1:0/a2a",
    token,
    path: resolve(directory, `${skill}.db`),
  });
  await new Promise<void>((r) => service.server.listen(0, "127.0.0.1", r));
  services.push(service);
  const a = service.server.address();
  assert(a && typeof a !== "string");
  const url = `http://127.0.0.1:${a.port}`;
  service.card.supportedInterfaces[0].url = url + "/a2a";
  return { url, token };
}
let flush: undefined | (() => Promise<void>);
try {
  const carrier = await start(
    "Carrier",
    "delivery-investigation",
    investigate,
    "retail-service",
  );
  const supplier = await start(
    "Supplier",
    "product-sourcing",
    supplierRunner(operations),
    "retail-service",
  );
  process.env.CARRIER_URL = carrier.url;
  process.env.CARRIER_TOKEN = carrier.token;
  process.env.SUPPLIER_URL = supplier.url;
  process.env.SUPPLIER_TOKEN = supplier.token;
  const { mastra } = await import("../apps/retail/src/mastra/index.ts");
  await registerCompletedCollaboration(mastra.getAgent('retailAgent'));
  flush = async () => {
    await mastra.observability.flush();
  };
  const gateway = await start(
    "Retail",
    "customer-service",
    retailRunner(async (message, thread, owner) => {
      const result = await mastra
        .getAgent("retailAgent")
        .generate(message, {
          memory: { thread, resource: owner },
          abortSignal: AbortSignal.timeout(210000),
        });
      evidence.push({
        message,
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        usage: result.usage,
      });
      writeFileSync(
        resolve(directory, "evidence.json"),
        JSON.stringify(evidence, null, 2),
      );
      return result.text;
    }),
    "customer-alex",
  );
  process.env.RETAIL_GATEWAY_URL = gateway.url;
  process.env.SHOPPING_TOKEN = gateway.token;
  const { mastra: shopping } = await import('../apps/shopping/src/mastra/index.ts');
  const shoppingThread = randomUUID();
  const retailFlush = flush;
  flush = async () => { await retailFlush?.(); await shopping.observability.flush(); };
  async function send(message: string, _previous?: unknown) {
    const result = await shopping.getAgent('shoppingAgent').generate(message, {
      memory: {thread: shoppingThread, resource: 'customer-alex'},
      abortSignal: AbortSignal.timeout(260000),
    });
    evidence.push({shoppingMessage: message, text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults});
    writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence,null,2));
    const db = database(process.env.SHOPPING_DELEGATION_DB_PATH!);
    try {
      const saved = read<{result: import('../packages/collaboration/client.ts').RemoteResult}>(db,
        JSON.stringify(['shopping','customer-alex',shoppingThread]),'active');
      assert(saved, 'The shopping agent must delegate the order request');
      return saved.result;
    } finally {db.close();}
  }
  const client = {send};
  const deadline = new Date(Date.now() + 72 * 3600000).toISOString();
  let task = await client.send(
    `My shoes in order-2001 say delivered but are missing. I need shoes for a wedding by ${deadline}. Size 9, maximum price $99. I prefer formal black shoes with cushioning but am open to similar options. Investigate and find a resolution.`,
  );
  assert.equal(task.state, "input-required");
  assert.match(task.question!, /reception/i);
  console.log("Passed: incoming delegation and carrier clarification.");
  task = await client.send(
    "No. My address is a house with no reception desk.",
    task,
  );
  assert.equal(task.state, "input-required");
  console.log("Passed: carrier resumed and alternatives evaluated.");
  const stateDb = database(process.env.RESOLUTION_DB_PATH);
  const state = read<{ phase: string; options: Array<{ sku: string }> }>(
    stateDb,
    JSON.stringify(["resolution", "customer-alex", `shopping-${task.taskId}`]),
    "active",
  );
  stateDb.close();
  assert(state);
  assert(
    ["options_ready", "awaiting_confirmation"].includes(state.phase),
    JSON.stringify(task),
  );
  if (state.phase === "options_ready")
    task = await client.send(
      "I choose the black leather derby. Please show me the replacement proposal.",
      task,
    );
  if (process.argv.includes('--revise')) {
    task = await client.send('I do not want the black leather derby, brown loafer or navy derby. Please ask the supplier for another formal shoe within my same size, $99 total budget and deadline. Show me a new proposal, but do not reserve it yet.', task);
    const revisedDb = database(process.env.RESOLUTION_DB_PATH!);
    try {
      const revised = read<{phase:string;proposal?:{sku:string};excludedSkus?:string[]}>(revisedDb,
        JSON.stringify(['resolution','customer-alex',`shopping-${task.taskId}`]),'active');
      assert.equal(revised?.phase,'awaiting_confirmation');
      assert.equal(revised.proposal?.sku,'formal-late-9');
      assert(revised.excludedSkus?.includes('formal-black-9'));
      assert.equal(read(operations,'stock','formal-late-9'),undefined);
      console.log('Passed: shopping relayed changed requirements, supplier adapted, and retail replaced the proposal without reserving.');
    } finally {revisedDb.close();}
  }
  assert.equal(task.state, "input-required");
  assert.match(task.question!, /1/);
  task = await client.send("1", task);
  assert.equal(task.state, "completed");
  assert.equal((task.data as { phase: string }).phase, "committed");
  assert.equal(read(operations, "stock", process.argv.includes("--revise") ? "formal-late-9" : "formal-black-9"), process.argv.includes("--revise") ? 4 : 3);
  console.log("Passed: exact confirmation produced one supplier reservation.");
  // Separate bounded supplier challenge: ordinary delivery is too late, but an
  // express route fits. The model must investigate and choose that route.
  const sourcing = new SpecialistClient(supplier.url, supplier.token, 'product-sourcing', 120000);
  const adaptation = await sourcing.send({action:'source', requirements: {
    size:'9', deadline, maxPriceCents:9900,
    preferences:'Formal oxford. The customer rejected the derby and loafers; find a feasible alternative. Consider delivery routes if ordinary delivery is too late.'
  }, excludedSkus:['formal-black-9','formal-brown-9','formal-navy-9']});
  evidence.push({supplierAdaptation:adaptation});
  writeFileSync(resolve(directory, 'evidence.json'),JSON.stringify(evidence,null,2));
  assert.equal(adaptation.state,'completed');
  const offers=(adaptation.data as {candidates:Array<{sku:string;priceCents:number;uncertainty:string}>}).candidates;
  assert.equal(offers.length,1);
  assert.equal(offers[0].sku,'formal-late-9');
  assert.equal(offers[0].priceCents,9400);
  assert.match(offers[0].uncertainty,/express/);
  console.log('Passed: supplier adapted to rejected products and selected a feasible express route.');
  console.log(`Evidence saved to ${directory}/evidence.json`);
} finally {
  for (const service of services.reverse()) await service.close();
  operations.close();
  await closeMcp();
  if (flush) await flush();
}
