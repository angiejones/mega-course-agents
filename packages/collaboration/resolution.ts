import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { getOrder } from "../store/index.ts";
import { read, write } from "./storage.ts";
import {
  requirementsSchema,
  investigationSchema,
  candidateSchema,
  type Requirements,
  type Candidate,
} from "./contracts.ts";
import { compare, type Evaluate } from "./comparison.ts";
import type { RemoteResult } from "./client.ts";
import shipments from "../../fixtures/fulfillment.json" with { type: "json" };
export type Remote = {
  send(
    input: unknown,
    previous?: { taskId: string; contextId: string },
  ): Promise<RemoteResult>;
};
type State = {
  id: string;
  orderId: string;
  sku: string;
  trackingId: string;
  requirements: Requirements;
  creditCents: number;
  phase: string;
  delivery?: RemoteResult;
  supplier?: RemoteResult;
  options?: Candidate[];
  comparisons?: Awaited<ReturnType<typeof compare>>;
  proposal?: Candidate;
  proposalTurn?: string;
  receipt?: unknown;
  error?: string;
  excludedSkus?: string[];
};
export class ResolutionService {
  constructor(
    readonly db: DatabaseSync,
    readonly store: DatabaseSync,
    readonly carrier: Remote,
    readonly supplier: Remote,
    readonly judge?: Evaluate,
  ) {}
  scope(customer: string, thread: string) {
    return JSON.stringify(["resolution", customer, thread]);
  }
  load(customer: string, thread: string) {
    return read<State>(this.db, this.scope(customer, thread), "active");
  }
  save(customer: string, thread: string, state: State) {
    write(this.db, this.scope(customer, thread), "active", state);
    return state;
  }
  async start(
    customer: string,
    thread: string,
    input: { orderId: string; sku: string; requirements: Requirements },
  ) {
    const existing = this.load(customer, thread);
    if (existing && !["declined", "committed"].includes(existing.phase))
      return existing;
    const r = requirementsSchema.parse(input.requirements);
    if (r.deadline <= new Date().toISOString())
      throw new Error("The delivery deadline must be in the future.");
    const result = getOrder(this.store, customer, input.orderId);
    if (!result.found) throw new Error("Order not found for this customer.");
    const item = result.order.items.find(
      (i: { sku: string }) => i.sku === input.sku,
    );
    if (!item) throw new Error("Item not found for this customer.");
    if (item.size !== r.size)
      throw new Error(
        "This resolution replaces the missing item in its purchased size.",
      );
    const record = shipments.find((s) => s.orderId === input.orderId);
    const shipment = record?.shipments.find((s) =>
      s.items.some((i) => i.sku === input.sku),
    );
    if (
      !shipment?.trackingId ||
      !record?.tracking.some(
        (t) => t.trackingId === shipment.trackingId && t.status === "delivered",
      )
    )
      throw new Error(
        "A delivered shipment is required for a disputed-delivery investigation.",
      );
    const state: State = {
      id: randomUUID(),
      orderId: input.orderId,
      sku: input.sku,
      trackingId: shipment.trackingId,
      requirements: r,
      creditCents: item.paidCents,
      phase: "investigating",
    };
    this.save(customer, thread, state);
    return this.investigate(customer, thread, state);
  }
  private async investigate(
    customer: string,
    thread: string,
    state: State,
    answer?: string,
  ) {
    try {
      state.delivery = await this.carrier.send(
        answer === undefined
          ? {
              trackingId: state.trackingId,
              deadline: state.requirements.deadline,
            }
          : { question: state.delivery?.question, answer },
        answer === undefined ? undefined : state.delivery,
      );
      if (state.delivery.state === "input-required")
        state.phase = "awaiting_clarification";
      else if (state.delivery.state === "completed") {
        const finding = investigationSchema.parse(state.delivery.data);
        state.phase =
          finding.outcome === "too_late"
            ? "ready_to_source"
            : finding.outcome === "recoverable"
              ? "recovery_available"
              : "needs_review";
      } else
        state.phase =
          state.delivery.state === "working" ? "investigating" : "needs_review";
      delete state.error;
    } catch {
      state.phase = "needs_review";
      state.error =
        "Carrier investigation unavailable. No recovery or replacement " +
        "has been promised.";
    }
    return this.save(customer, thread, state);
  }
  async clarify(customer: string, thread: string, answer: string) {
    const state = this.required(customer, thread);
    if (state.phase !== "awaiting_clarification")
      throw new Error("No clarification is pending.");
    return this.investigate(
      customer,
      thread,
      state,
      z.string().trim().min(1).max(8000).parse(answer),
    );
  }
  async source(
    customer: string,
    thread: string,
    revision?: { requirements: Partial<Requirements>; excludedSkus?: string[] },
  ) {
    const state = this.required(customer, thread);
    const retrySourcing =
      state.phase === "needs_review" &&
      state.delivery?.state === "completed" &&
      investigationSchema.safeParse(state.delivery.data).data?.outcome ===
        "too_late";
    if (
      ![
        "ready_to_source",
        "options_sourced",
        "options_ready",
        "awaiting_confirmation",
      ].includes(state.phase) &&
      !retrySourcing
    )
      throw new Error(
        "The carrier must first establish that recovery misses the deadline.",
      );
    const stock = this.store
      .prepare("SELECT available FROM inventory WHERE sku=?")
      .get(state.sku);
    if (!stock) throw new Error("Local availability is unknown.");
    if (Number(stock.available) > 0)
      throw new Error(
        "Local stock is available; use the store fulfillment process.",
      );
    if (revision) {
      const updated = requirementsSchema.parse({
        ...state.requirements,
        ...revision.requirements,
      });
      if (
        updated.size !== state.requirements.size ||
        updated.deadline <= new Date().toISOString()
      )
        throw new Error("Keep the purchased size and use a future deadline.");
      const finding = investigationSchema.parse(state.delivery?.data);
      if (finding.recoveryAt && finding.recoveryAt <= updated.deadline)
        throw new Error(
          "Recovery now fits the revised deadline; review the shipping " +
            "finding before sourcing another pair.",
        );
      state.requirements = updated;
      state.excludedSkus = revision.excludedSkus ?? state.excludedSkus ?? [];
    }
    // A changed search invalidates the earlier proposal before any remote work.
    delete state.proposal;
    delete state.proposalTurn;
    delete state.options;
    delete state.comparisons;
    state.phase = "sourcing";
    this.save(customer, thread, state);
    try {
      const response = await this.supplier.send({
        action: "source",
        requirements: state.requirements,
        excludedSkus: state.excludedSkus ?? [],
      });
      state.supplier = response;
      this.save(customer, thread, state);
      if (response.state !== "completed")
        throw new Error("Sourcing incomplete");
      state.options = z
        .object({ candidates: z.array(candidateSchema).max(20) })
        .parse(response.data)
        .candidates.filter(
          (c) =>
            !(state.excludedSkus ?? []).includes(c.sku) &&
            c.size === state.requirements.size &&
            c.arrival <= state.requirements.deadline &&
            c.priceCents <= state.requirements.maxPriceCents &&
            c.expiresAt > new Date().toISOString(),
        );
      state.phase = state.options.length ? "options_sourced" : "needs_review";
      delete state.error;
    } catch {
      state.phase = "needs_review";
      state.error =
        "Supplier sourcing unavailable. No replacement has been reserved.";
    }
    return this.save(customer, thread, state);
  }
  async assess(customer: string, thread: string) {
    const state = this.required(customer, thread);
    if (
      !["options_sourced", "options_ready"].includes(state.phase) ||
      !state.options?.length
    )
      throw new Error("Source options before assessing them.");
    if (state.options.some((c) => c.expiresAt <= new Date().toISOString()))
      throw new Error(
        "The quotes have expired. Source fresh options before assessment.",
      );
    state.comparisons = await compare(
      state.options,
      state.requirements,
      this.judge,
    );
    state.phase = "options_ready";
    return this.save(customer, thread, state);
  }
  propose(customer: string, thread: string, sku: string, turn: string) {
    const state = this.required(customer, thread);
    if (state.phase !== "options_ready")
      throw new Error("No evaluated options are available.");
    const candidate = state.options?.find((c) => c.sku === sku);
    const assessment = state.comparisons?.results.find((r) => r.sku === sku);
    if (!candidate || !assessment?.assessment?.suitable)
      throw new Error("Choose a successfully assessed suitable option.");
    if (candidate.expiresAt <= new Date().toISOString())
      throw new Error("The quote has expired.");
    // This fulfillment integration cannot charge a payment method.
    // Only store-covered replacements are accepted.
    if (candidate.priceCents > state.creditCents)
      throw new Error(
        "This replacement requires an additional payment. Refer it for " +
          "payment processing; do not request fulfillment approval.",
      );
    state.proposal = candidate;
    state.proposalTurn = turn;
    state.phase = "awaiting_confirmation";
    this.save(customer, thread, state);
    return {
      ...state,
      amountDueCents: 0,
      creditCents: state.creditCents,
      priceCents: candidate.priceCents,
      message:
        "Reply 1 to confirm this replacement or 2 to decline. This " +
        "authorizes a supplier reservation, not a delivery guarantee.",
    };
  }
  async confirm(
    customer: string,
    thread: string,
    decision: "confirm" | "decline" | undefined,
    turn: string,
  ) {
    const state = this.required(customer, thread);
    if (state.phase === "committed") return state;
    if (
      !["awaiting_confirmation", "committing"].includes(state.phase) ||
      !state.proposal
    )
      throw new Error("No replacement proposal is pending.");
    if (!decision || turn === state.proposalTurn)
      return {
        phase: "awaiting_confirmation",
        message: "Reply 1 to confirm or 2 to decline.",
      };
    if (decision === "decline") {
      if (state.phase === "committing")
        throw new Error(
          "Reservation outcome must be reconciled before declining.",
        );
      state.phase = "declined";
      return this.save(customer, thread, state);
    }
    const order = getOrder(this.store, customer, state.orderId);
    if (!order.found) throw new Error("Order no longer available.");
    const purchased = order.order.items.find(
      (item: { sku: string }) => item.sku === state.sku,
    );
    if (
      !purchased ||
      purchased.quantity < 1 ||
      purchased.paidCents !== state.creditCents ||
      state.proposal.priceCents > purchased.paidCents
    )
      throw new Error("The order changed; obtain a new proposal.");
    const key = JSON.stringify([customer, state.orderId, state.sku]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const claim = read<{ requestId: string }>(
        this.db,
        "fulfillment-claim",
        key,
      );
      if (claim && claim.requestId !== state.id)
        throw new Error(
          "A resolution is already being processed for this item.",
        );
      if (
        state.phase !== "committing" &&
        state.proposal.expiresAt <= new Date().toISOString()
      )
        throw new Error("Quote expired; obtain a new proposal.");
      write(this.db, "fulfillment-claim", key, { requestId: state.id });
      state.phase = "committing";
      this.save(customer, thread, state);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    try {
      const response = await this.supplier.send({
        action: "reserve",
        quoteId: state.proposal.quoteId,
        requestId: state.id,
      });
      if (response.state !== "completed")
        throw new Error("Reservation incomplete");
      state.receipt = z
        .object({
          quoteId: z.literal(state.proposal.quoteId),
          receiptId: z.string().min(1),
        })
        .parse(response.data);
      state.phase = "committed";
      delete state.error;
    } catch {
      state.error =
        "Reservation outcome is unresolved. Retry confirmation to " +
        "reconcile the same request; do not create another replacement.";
    }
    return this.save(customer, thread, state);
  }
  required(customer: string, thread: string) {
    const state = this.load(customer, thread);
    if (!state)
      throw new Error("No investigation exists in this conversation.");
    return state;
  }
}
