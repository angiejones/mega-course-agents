import "../../packages/config.ts";
import { SpecialistClient } from "../../packages/collaboration/client.ts";
const message = process.argv[2];
if (!message)
  throw new Error(
    "Supply a customer message, followed optionally by task ID and context ID.",
  );
const client = new SpecialistClient(
  process.env.RETAIL_GATEWAY_URL || "http://127.0.0.1:4303",
  process.env.SHOPPING_TOKEN || "",
  "customer-service",
  100000,
);
const previous = process.argv[3]
  ? { taskId: process.argv[3], contextId: process.argv[4] || "" }
  : undefined;
console.log(JSON.stringify(await client.send(message, previous), null, 2));
