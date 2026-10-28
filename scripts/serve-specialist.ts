import { serviceDescriptions } from "../packages/collaboration/service-descriptions.ts";
import { resolve } from "node:path";
import { findProjectRoot, settings } from "../packages/config.ts";
import { createAgentService } from "../packages/collaboration/transport.ts";
import { investigate } from "../agents/delivery/src/service.ts";
import { supplierRunner } from "../agents/supplier/src/service.ts";
import { database } from "../packages/collaboration/storage.ts";
const role = process.argv[2];
if (!["carrier", "supplier"].includes(role))
  throw new Error("Choose carrier or supplier.");
const isCarrier = role === "carrier";
const port = Number(process.env.PORT || (isCarrier ? 4301 : 4302));
const data = database(resolve(settings.collaborationDirectory, `${role}-operations.db`));
const service = createAgentService({
  name: isCarrier ? "Carrier delivery investigation" : "Supplier fulfillment",
  ...serviceDescriptions[isCarrier ? "delivery-investigation" : "product-sourcing"],
  skill: isCarrier ? "delivery-investigation" : "product-sourcing",
  catalogEntries: isCarrier ? [] : [
    {
      identifier: "urn:air:supplier.example:mcp:inventory",
      type: "application/mcp-server-card+json",
      description: "Inventory MCP server: search products and check stock availability.",
      url: "https://supplier.example/mcp/inventory/server-card.json",
    },
    {
      identifier: "urn:air:supplier.example:mcp:delivery",
      type: "application/mcp-server-card+json",
      description: "Delivery MCP server: check shipping options, costs and estimated arrival times.",
      url: "https://supplier.example/mcp/delivery/server-card.json",
    },
  ],
  url: new URL(
    "/a2a",
    process.env.SERVICE_PUBLIC_URL || `http://127.0.0.1:${port}`,
  ).href,
  token: process.env[isCarrier ? "CARRIER_TOKEN" : "SUPPLIER_TOKEN"] || "",
  owner: "retail-service",
  path: resolve(settings.collaborationDirectory, `${role}-tasks.db`),
  run: isCarrier ? investigate : supplierRunner(data),
});
service.server.listen(port, "127.0.0.1", () =>
  console.log(`${role} listening on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await service.close();
    data.close();
    process.exit(0);
  });
