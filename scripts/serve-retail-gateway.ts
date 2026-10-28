import {
  serviceDescriptions,
} from "../packages/collaboration/service-descriptions.ts";
import { resolve } from "node:path";
import { findProjectRoot, settings } from "../packages/config.ts";
import { createAgentService } from "../packages/collaboration/transport.ts";
import { retailRunner } from "../packages/collaboration/retail.ts";
import { mastra } from "../apps/retail/src/mastra/index.ts";
const port = Number(process.env.PORT || 4303);
const service = createAgentService({
  name: "Retail customer service",
  ...serviceDescriptions["customer-service"],
  skill: "customer-service",
  url: new URL(
    "/a2a",
    process.env.SERVICE_PUBLIC_URL || `http://127.0.0.1:${port}`,
  ).href,
  token: process.env.SHOPPING_TOKEN || "",
  owner: settings.customerId,
  path: resolve(settings.collaborationDirectory, "retail-tasks.db"),
  run: retailRunner(async (input, thread, owner) => {
    const result = await mastra.getAgent("retailAgent").generate(input, {
      memory: { thread, resource: owner },
      abortSignal: AbortSignal.timeout(210000),
    });
    return result.text;
  }),
});
service.server.listen(port, "127.0.0.1", () =>
  console.log(`Retail gateway listening on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await service.close();
    process.exit(0);
  });
