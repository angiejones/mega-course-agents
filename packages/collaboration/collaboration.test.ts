import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentService, type Runner } from "./transport.ts";
import { SpecialistClient } from "./client.ts";
import { database, read } from "./storage.ts";
import { source, reserve } from "../../agents/supplier/src/service.ts";
import { recoveryFinding } from "../../agents/delivery/src/service.ts";
import { compare, type Evaluate } from "./comparison.ts";
import { ResolutionService, type Remote } from "./resolution.ts";
import { openExchangeStore, seedExchangeStore } from "../exchanges/store.ts";
const token = "test-only-token-with-enough-characters";
const requirements = () => ({
  size: "9",
  deadline: new Date(Date.now() + 72 * 3600000).toISOString(),
  maxPriceCents: 9900,
  preferences: "Formal black shoes with cushioning",
});
const judge: Evaluate = async () => ({
  assessment: {
    suitable: true,
    reasons: ["Meets the supplied requirements"],
    tradeoffs: [],
    missingInformation: [],
  },
  tokens: 10,
});
async function listen(
  path: string,
  run: Runner,
  skill = "delivery-investigation",
  owner = "retail-service",
) {
  const service = createAgentService({
    name: "Independent service",
    description: "Test service",
    skillDescription: "Investigate the requested delivery and return a question or recovery finding.",
    skill,
    url: "http://127.0.0.1:0/a2a",
    token,
    owner,
    path,
    run,
  });
  await new Promise<void>((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const address = service.server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  service.card.supportedInterfaces[0].url = origin + "/a2a";
  return { ...service, origin };
}
test("A2A discovery, authentication, clarification, durable resume and owner isolation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "a2a-"));
  let service: Awaited<ReturnType<typeof listen>> | undefined;
  try {
    const run: Runner = async (input, history) =>
      history.length
        ? { state: "completed", data: { answer: input, original: history[0], priorTurns: history.length } }
        : {
            state: "input-required",
            question: "Does the destination have reception?",
          };
    service = await listen(join(dir, "tasks.db"), run);
    const client = new SpecialistClient(
      service.origin,
      token,
      "delivery-investigation",
    );
    assert.equal((await client.discover()).name, "Independent service");
    const catalogResponse = await fetch(service.origin + "/.well-known/ai-catalog.json");
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalogResponse.headers.get("content-type"), "application/ai-catalog+json");
    const catalog = await catalogResponse.json();
    assert.equal(catalog.specVersion, "1.0");
    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0].type, "application/a2a-agent-card+json");
    const card = await (await fetch(service.origin + "/.well-known/agent-card.json")).json();
    assert.equal(card.description, "Test service");
    assert.equal(card.skills[0].description, "Investigate the requested delivery and return a question or recovery finding.");
    assert.equal(catalog.entries[0].url, service.origin + "/.well-known/agent-card.json");
    assert(!JSON.stringify(catalog).includes(token));
    const discovery = await fetch(catalog.entries[0].url);
    assert.equal(discovery.status, 200);
    const publicCard = await discovery.text();
    assert.equal(JSON.parse(publicCard).name, "Independent service");
    assert(!publicCard.includes(token));
    for (const headers of [new Headers(), new Headers({ Authorization: "Bearer wrong-token" })]) {
      const unauthorized: Response = await fetch(service.origin + "/a2a", {
        method: "POST", headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: {} }),
      });
      assert.equal(unauthorized.status, 401);
    }
    const first = await client.send({ trackingId: "tracking-1" });
    assert.equal(first.state, "input-required");
    assert(first.taskId);
    assert.match(first.question!, /reception/);
    await service.close();
    service = await listen(
      join(dir, "tasks.db"),
      run,
      "delivery-investigation",
      "other-owner",
    );
    await assert.rejects(
      new SpecialistClient(
        service.origin,
        token,
        "delivery-investigation",
      ).send({ question: "Where was delivery recorded?", answer: "At a different building." }, first),
      /A2A request failed/,
    );
    await service.close();
    service = await listen(join(dir, "tasks.db"), run);
    const resumed = await new SpecialistClient(
      service.origin,
      token,
      "delivery-investigation",
    ).send({ question: "Where was delivery recorded?", answer: "At a different building." }, first);
    assert.equal(resumed.taskId, first.taskId);
    assert.equal(resumed.state, "completed");
    assert.deepEqual(resumed.data, {
      answer: { question: "Where was delivery recorded?", answer: "At a different building." },
      original: { trackingId: "tracking-1" },
      priorTurns: 1,
    });
  } finally {
    if (service) await service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Supplier excludes allocated and late stock; reservation retries are idempotent and expired quotes fail", () => {
  const db = database(":memory:");
  try {
    const candidates = source(db, requirements());
    assert.equal(candidates.length, 3);
    assert(
      !candidates.some(
        (c) => c.sku.includes("reserved") || c.sku.includes("late"),
      ),
    );
    const receipt = reserve(db, candidates[0].quoteId, "request-1");
    assert.deepEqual(reserve(db, candidates[0].quoteId, "request-1"), receipt);
    assert.equal(read(db, "stock", candidates[0].sku), 3);
    assert.throws(
      () => reserve(db, candidates[1].quoteId, "request-1"),
      /already used/,
    );
    assert.throws(
      () =>
        reserve(
          db,
          candidates[1].quoteId,
          "request-2",
          new Date(Date.now() + 16 * 60000),
        ),
      /expired/,
    );
  } finally {
    db.close();
  }
});
test("Carrier distinguishes recoverable, too late and inconclusive evidence", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(
    recoveryFinding(
      { trackingId: "track-exchange-2001", deadline: "2026-10-23T12:00:00Z" },
      { assessment: "misdelivered", findings: ["The customer account contradicts the recorded destination."] },
      now,
    ).outcome,
    "too_late",
  );
  assert.equal(
    recoveryFinding(
      { trackingId: "track-exchange-2001", deadline: "2026-10-26T12:00:00Z" },
      { assessment: "misdelivered", findings: ["The customer account contradicts the recorded destination."] },
      now,
    ).outcome,
    "recoverable",
  );
  assert.equal(
    recoveryFinding(
      { trackingId: "track-exchange-2001", deadline: "2026-10-26T12:00:00Z" },
      { assessment: "unresolved", findings: ["The destination has not been established."] },
      now,
    ).outcome,
    "inconclusive",
  );
});
test("Parallel assessments start every candidate and preserve successful assessments", async () => {
  const db = database(":memory:");
  try {
    const sourced = source(db, requirements());
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      ...sourced[i % sourced.length],
      sku: `candidate-${i}`,
    }));
    let active = 0,
      peak = 0;
    const result = await compare(
      candidates,
      requirements(),
      async (c, r) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        if (c.sku === candidates[1].sku) throw new Error("Unavailable");
        return judge(c, r);
      },
    );
    assert.equal(peak, candidates.length);
    assert.equal(result.results.filter((r) => r.assessment).length, 4);
    assert.equal(result.totalTokens, 40);
    assert.equal(result.results[1].error, "Assessment unavailable");
  } finally {
    db.close();
  }
});
test("Connected workflow uses real A2A endpoints and requires exact confirmation before one reservation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "resolution-"));
  const supplierDb = database(join(dir, "supplier.db"));
  const db = database(join(dir, "retail.db"));
  const store = openExchangeStore(join(dir, "store.db"));
  seedExchangeStore(store);
  let carrier: Awaited<ReturnType<typeof listen>> | undefined,
    supplier: Awaited<ReturnType<typeof listen>> | undefined;
  try {
    carrier = await listen(
      join(dir, "carrier-tasks.db"),
      async (input, history) =>
        history.length
          ? {
              state: "completed",
              data: recoveryFinding(
                history[0] as { trackingId: string; deadline: string },
                { assessment: "misdelivered", findings: [(input as {answer: string}).answer] },
              ),
            }
          : {
              state: "input-required",
              question: "Does the address have reception?",
            },
    );
    supplier = await listen(
      join(dir, "supplier-tasks.db"),
      async (input) => {
        const p = input as {
          action: string;
          requirements: ReturnType<typeof requirements>;
          quoteId: string;
          requestId: string;
        };
        return {
          state: "completed",
          data:
            p.action === "source"
              ? { candidates: source(supplierDb, p.requirements) }
              : reserve(supplierDb, p.quoteId, p.requestId),
        };
      },
      "product-sourcing",
    );
    const service = new ResolutionService(
      db,
      store,
      new SpecialistClient(carrier.origin, token, "delivery-investigation"),
      new SpecialistClient(supplier.origin, token, "product-sourcing"),
      judge,
    );
    const input = {
      orderId: "order-2001",
      sku: "formal-original-9",
      requirements: requirements(),
    };
    await assert.rejects(
      service.start("customer-sam", "wrong-owner", input),
      /not found/,
    );
    assert.equal(
      (await service.start("customer-alex", "thread-1", input)).phase,
      "awaiting_clarification",
    );
    await assert.rejects(
      service.source("customer-alex", "thread-1"),
      /must first/,
    );
    assert.equal(
      (await service.clarify("customer-alex", "thread-1", "No. My address is a house with no reception desk.")).phase,
      "ready_to_source",
    );
    const options = await service.source("customer-alex", "thread-1");
    assert.equal(options.phase, "options_sourced");
    assert.equal(options.comparisons, undefined);
    assert.throws(() => service.propose("customer-alex", "thread-1", options.options![0].sku, "premature"), /No evaluated options/);
    await service.assess("customer-alex", "thread-1");
    assert.equal(options.options!.length, 3);
    const proposal = service.propose(
      "customer-alex",
      "thread-1",
      options.options![0].sku,
      "selection-turn",
    );
    assert.equal(proposal.amountDueCents, 0);
    assert.equal(read(supplierDb, "stock", proposal.proposal!.sku), undefined);
    assert.equal(
      (
        await service.confirm(
          "customer-alex",
          "thread-1",
          undefined,
          "other-turn",
        )
      ).phase,
      "awaiting_confirmation",
    );
    const done = await service.confirm(
      "customer-alex",
      "thread-1",
      "confirm",
      "confirmation-turn",
    );
    assert.equal(done.phase, "committed");
    assert.deepEqual(
      await service.confirm(
        "customer-alex",
        "thread-1",
        "confirm",
        "confirmation-turn",
      ),
      done,
    );
    assert.equal(read(supplierDb, "stock", proposal.proposal!.sku), 3);
  } finally {
    if (carrier) await carrier.close();
    if (supplier) await supplier.close();
    supplierDb.close();
    db.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Unavailable carrier preserves unresolved state and never calls supplier", async () => {
  const dir = mkdtempSync(join(tmpdir(), "unavailable-"));
  const db = database(join(dir, "retail.db"));
  const store = openExchangeStore(join(dir, "store.db"));
  seedExchangeStore(store);
  let called = false;
  const unavailable: Remote = {
    send: async () => {
      throw new Error("offline");
    },
  };
  const supplier: Remote = {
    send: async () => {
      called = true;
      throw new Error("unexpected");
    },
  };
  try {
    const s = new ResolutionService(db, store, unavailable, supplier, judge);
    const state = await s.start("customer-alex", "thread", {
      orderId: "order-2001",
      sku: "formal-original-9",
      requirements: requirements(),
    });
    assert.equal(state.phase, "needs_review");
    assert.equal(called, false);
    assert.equal(s.load("customer-alex", "thread")!.id, state.id);
  } finally {
    db.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Lost reservation response reconciles without another allocation; another conversation cannot duplicate it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reconcile-"));
  const db = database(join(dir, "retail.db"));
  const supplierDb = database(join(dir, "supplier.db"));
  const store = openExchangeStore(join(dir, "store.db"));
  seedExchangeStore(store);
  let loseResponse = true;
  const carrier: Remote = {
    send: async () => ({
      taskId: "carrier-task",
      contextId: "carrier-context",
      state: "completed",
      data: recoveryFinding(
        {
          trackingId: "track-exchange-2001",
          deadline: requirements().deadline,
        },
        { assessment: "misdelivered", findings: ["The customer account contradicts the recorded destination."] },
      ),
    }),
  };
  const supplier: Remote = {
    send: async (input) => {
      const p = input as {
        action: string;
        requirements: ReturnType<typeof requirements>;
        quoteId: string;
        requestId: string;
      };
      const data =
        p.action === "source"
          ? { candidates: source(supplierDb, p.requirements) }
          : reserve(supplierDb, p.quoteId, p.requestId);
      if (p.action === "reserve" && loseResponse) {
        loseResponse = false;
        throw new Error("Response lost after commit");
      }
      return {
        taskId: "supplier-task",
        contextId: "supplier-context",
        state: "completed",
        data,
      };
    },
  };
  try {
    const s = new ResolutionService(db, store, carrier, supplier, judge);
    const input = {
      orderId: "order-2001",
      sku: "formal-original-9",
      requirements: requirements(),
    };
    for (const thread of ["first", "second"]) {
      await s.start("customer-alex", thread, input);
      const state = await s.source("customer-alex", thread);
      await s.assess("customer-alex", thread);
      s.propose("customer-alex", thread, state.options![0].sku, "selection");
    }
    assert.equal(
      (await s.confirm("customer-alex", "first", "confirm", "selection")).phase,
      "awaiting_confirmation",
      "The proposal turn cannot approve itself",
    );
    assert.equal(
      (await s.confirm("customer-alex", "first", "confirm", "approval")).phase,
      "committing",
    );
    assert.equal(read(supplierDb, "stock", "formal-black-9"), 3);
    assert.equal(
      (await s.confirm("customer-alex", "first", "confirm", "retry")).phase,
      "committed",
    );
    assert.equal(read(supplierDb, "stock", "formal-black-9"), 3);
    await assert.rejects(
      s.confirm("customer-alex", "second", "confirm", "approval"),
      /already being processed/,
    );
  } finally {
    db.close();
    store.close();
    supplierDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Declining a proposal and supplier failure never reserve stock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "decline-"));
  const db = database(join(dir, "retail.db"));
  const supplierDb = database(join(dir, "supplier.db"));
  const store = openExchangeStore(join(dir, "store.db"));
  seedExchangeStore(store);
  let offline = false,
    reservations = 0;
  const carrier: Remote = {
    send: async () => ({
      taskId: "carrier-task",
      contextId: "carrier-context",
      state: "completed",
      data: recoveryFinding(
        {
          trackingId: "track-exchange-2001",
          deadline: requirements().deadline,
        },
        { assessment: "misdelivered", findings: ["The customer account contradicts the recorded destination."] },
      ),
    }),
  };
  const supplier: Remote = {
    send: async (input) => {
      if (offline) throw new Error("offline");
      const p = input as {
        action: string;
        requirements: ReturnType<typeof requirements>;
      };
      if (p.action === "reserve") reservations++;
      return {
        taskId: "supplier-task",
        contextId: "supplier-context",
        state: "completed",
        data: { candidates: source(supplierDb, p.requirements) },
      };
    },
  };
  try {
    const s = new ResolutionService(db, store, carrier, supplier, judge);
    const input = {
      orderId: "order-2001",
      sku: "formal-original-9",
      requirements: requirements(),
    };
    await s.start("customer-alex", "decline", input);
    const state = await s.source("customer-alex", "decline");
    await s.assess("customer-alex", "decline");
    s.propose("customer-alex", "decline", state.options![0].sku, "selection");
    assert.equal(
      (await s.confirm("customer-alex", "decline", "decline", "decision"))
        .phase,
      "declined",
    );
    assert.equal(reservations, 0);
    offline = true;
    await s.start("customer-alex", "offline", input);
    assert.equal(
      (await s.source("customer-alex", "offline")).phase,
      "needs_review",
    );
    assert.equal(reservations, 0);
  } finally {
    db.close();
    store.close();
    supplierDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Streaming publishes a task before its final artifact and status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stream-"));
  const service = await listen(join(dir, "tasks.db"), async () => ({
    state: "completed",
    data: { finding: "verified" },
  }));
  try {
    const response = await fetch(service.origin + "/a2a", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "A2A-Version": "1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "stream",
        method: "SendStreamingMessage",
        params: {
          message: {
            messageId: "stream-message",
            role: "ROLE_USER",
            parts: [{ data: { trackingId: "x" } }],
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /text\/event-stream/);
    const events = (await response.text())
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, "")));
    assert(events[0].result.task);
    assert(
      events.some(
        (e) =>
          e.result.artifactUpdate?.artifact.parts[0].data.finding ===
          "verified",
      ),
    );
    assert(
      events.some(
        (e) => e.result.statusUpdate?.status.state === "TASK_STATE_COMPLETED",
      ),
    );
  } finally {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Missing a warehouse dispatch cutoff moves arrival to the next dispatch day", () => {
  const db = database(":memory:");
  try {
    const r = { ...requirements(), deadline: "2026-10-23T23:00:00Z" };
    const before = source(db, r, new Date("2026-10-20T16:59:00Z"));
    const after = source(db, r, new Date("2026-10-20T17:00:00Z"));
    assert.equal(before[0].arrival, "2026-10-21T17:00:00.000Z");
    assert.equal(after[0].arrival, "2026-10-22T17:00:00.000Z");
  } finally {
    db.close();
  }
});

test("Retail preserves free-text clarification and task references across repeated questions", async () => {
  const db = database(':memory:');
  const store = openExchangeStore(':memory:');
  seedExchangeStore(store);
  const calls: Array<{input:unknown;previous:unknown}> = [];
  const carrier: Remote = {send: async (input, previous) => {
    calls.push({input, previous});
    const ref = {taskId:'delivery-task',contextId:'delivery-context'};
    if (calls.length === 1) return {...ref,state:'input-required',question:'Do you recognize the recorded entrance?'};
    if (calls.length === 2) return {...ref,state:'input-required',question:'Has anyone authorized accepted the parcel?'};
    return {...ref,state:'completed',data:{outcome:'inconclusive', findings:['The customer cannot identify the destination.'],recoveryAt:null,reference:'review-needed'}};
  }};
  const supplier: Remote = {send:async () => {throw new Error('Must not source from inconclusive evidence');}};
  try {
    const service = new ResolutionService(db,store,carrier,supplier);
    await service.start('customer-alex','clarification-test',{orderId:'order-2001',sku:'formal-original-9',requirements:requirements()});
    const second = await service.clarify('customer-alex','clarification-test',"I'm not sure. It may be my neighbor's entrance.");
    assert.equal(second.phase,'awaiting_clarification');
    assert.deepEqual(calls[1].input,{question:'Do you recognize the recorded entrance?',answer:"I'm not sure. It may be my neighbor's entrance."});
    assert.equal((calls[1].previous as {taskId:string}).taskId,'delivery-task');
    const third = await service.clarify('customer-alex','clarification-test',"I don't know who accepted it.");
    assert.deepEqual(calls[2].input,{question:'Has anyone authorized accepted the parcel?',answer:"I don't know who accepted it."});
    assert.equal((calls[2].previous as {contextId:string}).contextId,'delivery-context');
    assert.equal(third.phase,'needs_review');
    await assert.rejects(() => service.source('customer-alex','clarification-test'),/must first establish/);
  } finally {db.close(); store.close();}
});

test("Retry sourcing updates shopping requirements without losing the investigation", async () => {
  const db = database(':memory:');
  const store = openExchangeStore(':memory:');
  seedExchangeStore(store);
  let sent: any;
  const supplier: Remote = { send: async input => {
    sent = input;
    return {taskId: 'new-sourcing', contextId: 'supplier-context', state: 'completed', data: {candidates: []}};
  }};
  const carrier: Remote = {send: async () => { throw new Error('Must not repeat investigation'); }};
  const service = new ResolutionService(db, store, carrier, supplier);
  const original = requirements();
  const delivery = {taskId: 'existing-investigation', contextId: 'existing-context', state: 'completed' as const,
    data: {outcome: 'too_late', findings: ['Recovery misses deadline'], recoveryAt: new Date(Date.now()+96*3600000).toISOString(), reference: 'finding'}};
  try {
    service.save('customer-alex', 'existing-chat', {
      id: 'existing-case', orderId: 'order-2001', sku: 'formal-original-9', trackingId: 'track-exchange-2001',
      requirements: {...original, preferences: 'Investigate delivery'}, creditCents: 9900,
      phase: 'needs_review', delivery, error: 'Supplier sourcing unavailable.', excludedSkus: ['rejected-product'],
    });
    const preferences = 'Formal shoes with cushioning; similar alternatives welcome';
    const result = await service.source('customer-alex', 'existing-chat', {requirements: {preferences, maxPriceCents: 8900}});
    assert.deepEqual(sent.requirements, {...original, preferences, maxPriceCents: 8900});
    assert.deepEqual(sent.excludedSkus, ['rejected-product']);
    assert.deepEqual(result.delivery, delivery);
    assert.equal(result.id, 'existing-case');
    assert.equal(result.error, undefined);
    assert.equal(result.receipt, undefined);
  } finally {db.close(); store.close();}
});
