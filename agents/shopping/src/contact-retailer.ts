import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { resolve } from "node:path";
import { settings, findProjectRoot } from "../../../packages/config.ts";
import { SpecialistClient } from "../../../packages/collaboration/client.ts";
import { database } from "../../../packages/collaboration/storage.ts";
import { ShoppingDelegation } from "./delegation.ts";
import type { RemoteResult } from "../../../packages/collaboration/client.ts";

const pending = new Map<string, Promise<RemoteResult>>();

export const contactRetailer = createTool({
  id: "contact-retailer",
  description:
    "Delegate this customer order request, clarification, revised " +
    "preferences or confirmation to the independent retail agent " +
    "through A2A. The application forwards the actual customer " +
    "message and keeps task IDs. Subsequent replies to an outstanding " +
    "retailer task, including its confirmation choices, continue " +
    "through this tool. The retailer owns interpretation of those " +
    "replies. This tool accepts no model-written message or approval.",
  inputSchema: z.object({}).strict(),
  execute: async (_, context) => {
    const thread = context?.agent?.threadId;
    if (!thread) throw new Error("A shopping conversation is required");
    const path = resolve(
      findProjectRoot(),
      process.env.SHOPPING_DELEGATION_DB_PATH ||
        resolve(settings.collaborationDirectory, "shopping-delegations.db"),
    );
    const key = JSON.stringify([path, settings.customerId, thread]);
    const active = pending.get(key);
    const operation = (async () => {
      if (active) await active.catch(() => undefined);
      const db = database(path);
      try {
        const client = new SpecialistClient(
          process.env.RETAIL_GATEWAY_URL || "http://127.0.0.1:4303",
          process.env.SHOPPING_TOKEN || "",
          "customer-service",
          240000,
        );
        const current = context?.agent?.getMessages?.() ?? [];
        return await new ShoppingDelegation(db, client).forward(
          settings.customerId,
          thread,
          current.some((m: { role: string }) => m.role === "user")
            ? current
            : (context?.agent?.messages ?? []),
        );
      } finally {
        db.close();
      }
    })();
    pending.set(key, operation);
    try {
      return await operation;
    } finally {
      if (pending.get(key) === operation) pending.delete(key);
    }
  },
});
