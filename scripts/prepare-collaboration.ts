import { mkdirSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { findProjectRoot } from "../packages/config.ts";
import {
  openExchangeStore,
  seedExchangeStore,
} from "../packages/exchanges/store.ts";
const root = findProjectRoot();
const directory = resolve(root, "data/resolution-sessions", randomUUID());
mkdirSync(directory, { recursive: true });
const storePath = resolve(directory, "store.db");
const db = openExchangeStore(storePath);
try {
  seedExchangeStore(db);
} finally {
  db.close();
}
writeFileSync(
  resolve(root, "data/exchange-studio.json"),
  JSON.stringify(
    { storePath, agentPath: resolve(directory, "agent.db") },
    null,
    2,
  ),
);
const env = resolve(root, ".env.local");
// Only add absent credentials. Never print or replace existing secrets.
for (const name of ["CARRIER_TOKEN", "SUPPLIER_TOKEN", "SHOPPING_TOKEN"])
  if (!process.env[name])
    appendFileSync(env, `\n${name}=${randomBytes(32).toString("hex")}\n`, {
      mode: 0o600,
    });
console.log(
  "Created an isolated retail store and selected it for Studio. Existing stores and service records were preserved.",
);
console.log(
  "Start retail Studio with npm run dev. Start each specialist only when adding its tools.",
);
console.log(
  "Use order-2001, size 9, a deadline three days from now, and a maximum price of $99.",
);
