import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { resolve } from "node:path";
import { settings, findProjectRoot } from "../config.ts";
import { openExchangeStore } from "../exchanges/store.ts";
import { customerDecision } from "../exchanges/confirmation.ts";
import { database } from "./storage.ts";
import { SpecialistClient } from "./client.ts";
import { resolutionPath } from "./retail.ts";
import { ResolutionService } from "./resolution.ts";
import { latestCustomerMessage, customerTurn } from "./customer-message.ts";
import { requirementsSchema } from "./contracts.ts";
function service() {
  return new ResolutionService(
    database(resolutionPath()),
    openExchangeStore(settings.storePath),
    new SpecialistClient(
      process.env.CARRIER_URL || "http://127.0.0.1:4301",
      process.env.CARRIER_TOKEN || "",
      "delivery-investigation",
      60000,
    ),
    new SpecialistClient(
      process.env.SUPPLIER_URL || "http://127.0.0.1:4302",
      process.env.SUPPLIER_TOKEN || "",
      "product-sourcing",
      100000,
    ),
  );
}
async function use<T>(
  thread: string | undefined,
  fn: (
    s: ResolutionService,
    customer: string,
    thread: string,
  ) => Promise<T> | T,
) {
  if (!thread) throw new Error("A conversation thread is required.");
  const s = service();
  try {
    return await fn(s, settings.customerId, thread);
  } finally {
    s.db.close();
    s.store.close();
  }
}
export const resolutionTools = {
  investigateMissingDelivery: createTool({
    id: "investigate-missing-delivery",
    description:
      "Investigate a disputed delivery through the shipping company. " +
      "Verifies order ownership and shipment status. Returns a finding " +
      "or a request for customer information.",
    inputSchema: z
      .object({
        orderId: z.string(),
        sku: z.string(),
        requirements: requirementsSchema,
      })
      .strict(),
    execute: async (input, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.start(customer, thread, input),
      ),
  }),
  clarifyDelivery: createTool({
    id: "clarify-delivery",
    description:
      "Continue a pending shipping company investigation. Forwards the " +
      "actual latest customer message unchanged with the saved task " +
      "references.",
    inputSchema: z.object({}).strict(),
    execute: async (_, c) => {
      const current = c?.agent?.getMessages?.() ?? [];
      const { text } = latestCustomerMessage(
        current.some((m) => m.role === "user")
          ? current
          : (c?.agent?.messages ?? []),
      );
      return use(c?.agent?.threadId, (s, customer, thread) =>
        s.clarify(customer, thread, text),
      );
    },
  }),
  sourceReplacement: createTool({
    id: "source-replacement",
    description:
      "After carrier recovery misses the deadline and local stock is " +
      "unavailable, delegate sourcing to the supplier. Returns " +
      "validated offers without running comparison subagents or reserving " +
      "stock. Supply the customer’s current product preferences and " +
      "budget from the conversation. Size and deadline come from the " +
      "saved case.",
    inputSchema: requirementsSchema.pick({
      preferences: true,
      maxPriceCents: true,
    }),
    execute: async (input, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.source(customer, thread, { requirements: input }),
      ),
  }),
  reviseReplacementSearch: createTool({
    id: "revise-replacement-search",
    description:
      "When the customer changes preferences, budget or deadline, or " +
      "rejects offered products, ask the supplier to search again. " +
      "Supply the full current requirements and all rejected SKUs. " +
      "Invalidates the old proposal. Cannot change purchased size or " +
      "run during reservation.",
    inputSchema: z
      .object({
        requirements: requirementsSchema,
        excludedSkus: z.array(z.string()).max(20),
      })
      .strict(),
    execute: async (input, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.source(customer, thread, input),
      ),
  }),
  compareReplacementOptions: createTool({
    id: "compare-replacement-options",
    description:
      "Assess the sourced options against customer requirements using " +
      "parallel product-assessment subagents. Returns suitability, " +
      "reasons, tradeoffs and missing information. Use product evidence " +
      "to explain recommendations and unknown features. Does not " +
      "propose or reserve a replacement.",
    inputSchema: z.object({}).strict(),
    execute: async (_, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.assess(customer, thread),
      ),
  }),
  proposeReplacement: createTool({
    id: "propose-replacement",
    description:
      "Prepare the exact terms for an evaluated supplier option. Use " +
      "when the customer selects an option, wants to proceed with a " +
      "recommendation, or asks what they would owe and when that " +
      "option would arrive. Resolve the option from the conversation " +
      "and current offers; clarify only if the choice is ambiguous. " +
      "The customer does not need to ask for a proposal. Use this " +
      "result for the payable amount and terms instead of inferring " +
      "them from the listed price. Present the terms and request a " +
      "separate reply of 1 to confirm or 2 to decline. Preparing terms " +
      "does not reserve or purchase the item, and interest in an " +
      "option is not authorization to reserve it.",
    inputSchema: z.object({ sku: z.string() }).strict(),
    execute: async (input, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.propose(
          customer,
          thread,
          input.sku,
          customerTurn(
            c?.agent?.getMessages?.() ?? [],
            c?.agent?.messages ?? [],
          ),
        ),
      ),
  }),
  confirmReplacement: createTool({
    id: "confirm-replacement",
    description:
      "Confirm or decline the pending supplier replacement using the " +
      "actual latest customer message. No decision may be supplied by " +
      "the model. Retry reconciles the same request.",
    inputSchema: z.object({}).strict(),
    execute: async (_, c) =>
      use(c?.agent?.threadId, (s, customer, thread) =>
        s.confirm(
          customer,
          thread,
          customerDecision(
            c?.agent?.getMessages?.() ?? [],
            c?.agent?.messages ?? [],
          ),
          customerTurn(
            c?.agent?.getMessages?.() ?? [],
            c?.agent?.messages ?? [],
          ),
        ),
      ),
  }),
  getResolution: createTool({
    id: "get-resolution",
    description:
      "Retrieve the persisted investigation, supplier options, " +
      "comparison results and reservation status for this customer " +
      "conversation.",
    inputSchema: z.object({}).strict(),
    execute: async (_, c) =>
      use(
        c?.agent?.threadId,
        (s, customer, thread) =>
          s.load(customer, thread) ?? { phase: "not_started" },
      ),
  }),
};
