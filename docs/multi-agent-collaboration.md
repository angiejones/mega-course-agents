# Build collaboration into the retail agent

Start with the existing retail agent and add capabilities when the customer problem requires them. The supplied service and tool implementations are separate from registration. This branch contains the completed retail and shopping agents. To follow the lessons incrementally, first remove the resolutionTools registrations from the retail agent and contactRetailer from the shopping agent’s tools object. Keep their imports and existing retail tools. The steps below describe adding them back.

## Begin with shipment lookup

Use Node 22.23.3 and the existing model credentials. Before a new practice environment, prepare a store and generate a current request:

```sh
npm run prepare:collaboration
npm run recording:request
```

Preparation creates and selects a fresh store without deleting earlier stores. It may add missing service tokens to `.env.local`. The new scenario's collaboration databases default to the selected store's directory. Explicit database environment variables override these defaults. Each process reads the selected paths at startup, so processes started for an earlier scenario must be restarted before using a new one.

Start retail Studio in its own terminal:

```sh
npm run dev
```

Open http://localhost:4111 and select Retail customer service. Send the generated request in a new thread. The customer is missing the shoes from order-2001, size 9, with a $99 maximum. The generated deadline is three days ahead, so the fictional four-day recovery will miss it. Using a much later deadline can correctly produce a recovery finding instead of replacement sourcing.

At this point, the agent has the existing MCP lookups but no investigation tool. Shipping and supplier services are not needed. Inspect the actual tool results to distinguish a tracking record from a completed investigation. The agent's response may vary; do not add dialogue instructions to make it match an example.

## Register the investigation

Start the shipping company in a separate terminal:

```sh
npm run serve:carrier
```

Inspect its public Agent Card and the client in `packages/collaboration/client.ts`. The investigation tool in `packages/collaboration/tools.ts` verifies order ownership and delegates a tracking ID and deadline through A2A. Register it by adding these properties inside the object returned by `tools` in `apps/retail/src/mastra/agent.ts`:

```ts
investigateMissingDelivery: resolutionTools.investigateMissingDelivery,
getResolution: resolutionTools.getResolution,
```

The imports are already in that file. Verify the new tools in Studio's Config after reload, then continue the same chat:

```text
Please investigate whether the missing parcel can be recovered before my deadline.
```

Now inspect the A2A task, its status and the actual question. The shipping company model retrieves private evidence and decides what customer information it needs. Reception appears in fictional delivery records, not in a required question template.

## Add clarification

Add the continuation tool to the same object:

```ts
clarifyDelivery: resolutionTools.clarifyDelivery,
```

It forwards the actual latest customer message and the saved question with the task and context IDs. No model-generated boolean or answer is accepted. Answer the actual question using Alex's facts: the address is a detached house with no reception, the adjacent office is not the delivery address, and nobody there is authorized to accept the parcel. An uncertain answer may lead to another question or an inconclusive finding.

Keep the same thread. A new chat doesn't share its resolution state. If Studio must restart to load a registration, reopen the saved thread afterward.

## Add supplier sourcing

When the investigation establishes that recovery misses the deadline, start the supplier in another terminal:

```sh
npm run serve:supplier
```

Inspect its Agent Card and sourcing contract. Add these properties to the retail registration:

```ts
sourceReplacement: resolutionTools.sourceReplacement,
reviseReplacementSearch: resolutionTools.reviseReplacementSearch,
```

Ask retail to find replacement options. The supplier model chooses products and delivery routes to investigate. Code validates stock, allocation restrictions, size, total price, arrival and quote expiry. The returned offers do not trigger assessments or reservations.

A revised search sends updated requirements and rejected products. It clears old offers, assessments and proposals before searching again. A completed supplier search is a finished A2A task; revision starts a new task. The outer retail conversation continues.

## Add parallel product decisions

Inspect the GPT-6 Sol subagent in `packages/collaboration/product-assessment.ts` and parallel calls in `packages/collaboration/comparison.ts`, then register the comparison tool:

```ts
compareReplacementOptions: resolutionTools.compareReplacementOptions,
```

Ask retail to assess the sourced options. Each focused GPT-6 Sol subagent receives one product's name and features plus customer preferences. Application code starts all assessments in parallel, retaining product IDs and successful results if another request fails. Each subagent returns suitability, reasons, tradeoffs and missing information. Retail uses those assessments to explain its recommendation.

If the supplier returns one offer, the run has one assessment. Use `npm run compare:products` for a separate fixed-shortlist sequential/parallel experiment. That command tests Jev requests; it doesn't measure a live supplier search or prove an end-to-end speedup.

## Add a customer-authorized reservation

Inspect the proposal and confirmation implementation, then register both tools:

```ts
proposeReplacement: resolutionTools.proposeReplacement,
confirmReplacement: resolutionTools.confirmReplacement,
```

Choose an actually offered, suitably assessed product and request its exact proposal. Review product, size, price, credit, amount due, arrival estimate and expiry. Reply `1` in a separate customer turn to confirm, or `2` to decline. The model cannot supply the approval argument. Code checks the current proposal and customer turn before reserving.

Quotes expire after fifteen minutes. To refresh them, source again, assess the new offers and request a new proposal. A receipt confirms a reservation, not payment, dispatch or guaranteed delivery. Lost-response retries retain the same business request ID so the supplier returns the existing receipt without reserving twice.

## Add a personal shopping connection

Use a fresh, unfulfilled scenario for another reservation, keeping the completed retail tool registrations. Start that scenario's shipping company, supplier and retail processes. Start the retail gateway and shopping Studio in additional terminals:

```sh
npm run serve:retail-gateway
```

```sh
npm run dev:shopping
```

Inspect the retail Agent Card and `agents/shopping/src/contact-retailer.ts`. If you removed the shopping registration to follow along, restore it now. Add this property inside the `tools` object in `agents/shopping/src/agent.ts`:

```ts
contactRetailer,
```

Open http://localhost:4116 and select Personal shopping assistant. Its tool forwards actual customer messages, retains the retail task references and delegates through A2A. Retail's specialist tasks remain separate. The retailer still owns the proposal terms and confirmation decisions.

The default ports are 4301 for shipping, 4302 for supplier, 4111 for retail Studio, 4303 for the gateway and 4116 for shopping Studio. Do not launch duplicate processes on occupied ports. `CARRIER_URL`, `SUPPLIER_URL`, `RETAIL_GATEWAY_URL` and `ORDER_MCP_URL` configure client connections. `PORT` and `SERVICE_PUBLIC_URL` configure each specialist's listener and advertised address. Non-loopback client connections require HTTPS.

## Observe the boundaries

| Component | Owns | Returns |
| --- | --- | --- |
| Shopping agent | Alex's conversation, preferences and incoming delegation | Retail questions, offers and reservation result |
| Retail agent | Order ownership checks, resolution and approval | Customer-facing resolution and reservation reference |
| Carrier agent | Private delivery evidence and recovery availability | Clarification request or investigation findings |
| Supplier agent | Warehouse rules, allocations, quotes and reservation records | Feasible options or an idempotent reservation receipt |
| Parallel LLM subagents | Assessment of one candidate against stated preferences | Suitability, reasons, tradeoffs and missing information |

The specialist services publish public Agent Cards at `/.well-known/agent-card.json` and authenticated A2A v1 JSON-RPC endpoints at `/a2a`. The client verifies the expected skill, protocol, and exact configured endpoint before delegation. It rejects redirects. The transport uses the official A2A SDK, with SQLite-backed task storage scoped to the authenticated caller. The application retains task and context IDs across clarification turns. A paused investigation can resume after a service restart.

These services use an explicit official A2A SDK transport adapter so task persistence and caller ownership are visible in the application. This is not Mastra's native A2A server. Streaming is exposed by the SDK transport; the retail coordinator currently uses blocking requests with deadlines and persisted task references.

Inspect the retail trace in Studio for order lookup, investigation, clarification, sourcing, comparison, proposal and confirmation. `getResolution` includes each comparison result, elapsed time, total reported tokens. The `supplier.data.investigation` decision record shows product and delivery choices and quote rejection reasons without exposing private stock counts. Separate specialist model calls run in their own processes.

## Verify behavior

```sh
npm run check
npm run verify:collaboration
npm run verify:collaboration-progression
npm run verify:delegation-live
npm run compare:products
npm run compare:assessment-architectures
```

The progression check starts with empty registrations in its isolated process and adds capabilities only in its isolated process, checking each boundary through live model calls. Completed-flow verification explicitly registers all capabilities in its own process; it never edits the learner composition files.

Offline checks cover actual A2A HTTP transport with deterministic specialist responses, authentication, ownership, persisted clarification, supplier rules, quote expiry, parallel execution, partial assessment failure, confirmation and duplicate prevention. Live verification uses configured model credentials, creates isolated databases, starts temporary test listeners, and closes them afterward. It exercises incoming and outgoing A2A requests between the shopping, retail, shipping and supplier agents, with focused LLM subagents for product assessments, then tests a supplier search where rejected products require an express alternative. `compare:products` measures sequential and parallel Jev calls on the same inputs; parallelism does not imply reduced token usage or cost. `compare:assessment-architectures` preserves the separate subagent alternative and compares it with direct retail assessment, including the final recommendation. These experiments are separate from the production LLM evaluator. It replays the same assessment context three times per scenario and approach, saves every output and reported usage under `data/assessment-comparison/`, then checks approval and reservation transitions with the recorded assessments in isolated stores. These are controlled assessment replays and deterministic service checks, not repeated autonomous customer conversations. The separate live verification covers the connected A2A conversation.

For an unavailable shipping service, use the deterministic failure test. Keep active development sessions running. The retail agent retains an unresolved record and cannot promise recovery. If a reservation response is lost, retry confirmation in the same conversation. The supplier returns the original receipt for the same request ID. A different conversation cannot reserve a second replacement for the same purchased item.

## Deployment boundaries

The included carrier evidence, warehouse inventory and fulfillment records are fictional local adapters. Replace those adapters with authorized business integrations before serving real customers. Reservation writes are local database records; payment, dispatch and carrier recovery booking are outside this implementation.

The implementation includes bearer authentication, caller-scoped task storage, bounded inputs, request deadlines, explicit confirmation and transactional reservation writes. Deployment still requires managed credentials, TLS termination, per-customer identity, retention and backup policies, operational monitoring and load testing. Keep Studio and its native development endpoints private. SQLite and in-process event delivery target one service instance; multi-instance execution requires shared storage and coordinated task execution. An interrupted active model run needs reconciliation; durable storage does not automatically restart that run.

## Protocol reference

The [official A2A and MCP guide](https://a2a-protocol.org/dev/topics/a2a-and-mcp/) describes agent delegation and tool access as complementary. This example delegates sourcing decisions to the supplier while its local tools enforce business constraints.
