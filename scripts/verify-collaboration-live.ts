import { serviceDescriptions } from "../packages/collaboration/service-descriptions.ts";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve("data/collaboration-verification", randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, "store.db");
process.env.AGENT_DB_PATH = resolve(directory, "agent.db");
process.env.RESOLUTION_DB_PATH = resolve(directory, "resolutions.db");
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
  const client = new SpecialistClient(
    gateway.url,
    gateway.token,
    "customer-service",
    240000,
  );
  // The progressive verifier checks the unconnected lesson opening.
  // This verifier explicitly exercises the completed composition.
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
  assert.equal(task.state, "input-required");
  assert.match(task.question!, /1/);
  task = await client.send("1", task);
  assert.equal(task.state, "completed");
  assert.equal((task.data as { phase: string }).phase, "committed");
  assert.equal(read(operations, "stock", "formal-black-9"), 3);
  console.log("Passed: exact confirmation produced one supplier reservation.");
  console.log(`Evidence saved to ${directory}/evidence.json`);
} finally {
  for (const service of services.reverse()) await service.close();
  operations.close();
  await closeMcp();
  if (flush) await flush();
}
