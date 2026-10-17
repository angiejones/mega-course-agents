# Chapter 2: Exchange capabilities

This branch extends the Chapter 1 retail customer service agent with inventory lookup, exchange policy checks, quotes, Jev issue classification, customer confirmation, and structured responses.

## Set up

Use Node 22.23.3 and npm 10.9.9, then install the locked dependencies with `npm ci`. Preserve an existing `.env.local`; copy `.env.example` only if that file is missing. Add your own `OPENAI_API_KEY` and `TYPESAFE_API_KEY` privately. Get a TypeSafe key from the [console](https://console.typesafe.ai/). The Jev integration uses `@typesafe-ai/sdk` 0.7.0 and `jev-1.13.0`; your account needs access to that model.

Run the offline checks:

```bash
npm run check && npm run verify:exchange-agent && npm run verify:exchange-services && npm run verify:step-limit
```

Start Studio in a separate terminal:

```bash
npm run dev:exchanges
```

This creates new fictional store data under `data/exchanges/<id>/` and starts Studio with that store and a separate conversation database. Existing data is preserved. Open [Mastra Studio](http://localhost:4111) and select **Retail customer service**. Stop Studio with Control+C before starting another session on the same port.

`npm run prepare:exchanges` prepares data without starting Studio and prints a manifest path. To resume that store later, set `STORE_DB_PATH` and `AGENT_DB_PATH` to the absolute paths from its manifest before running `npm run dev`. Use the same paths to retain both the store state and conversations. The optional, ignored `data/exchange-studio.json` can select local databases; explicit nondefault paths override it.

Codespaces support is configured, but a fresh Codespace has not been verified. Both provider keys are required for the exchange examples. Keep forwarded ports private.

## Try the exchange

The simulated customer is Alex (`customer-alex`). Ask:

> The blue shoes in order-1001 squeeze my toes. Can I exchange them for size 9?

The agent can retrieve the order and inventory, then prepare a proposal. Reply **1** to confirm or **2** to decline in the same conversation. The confirmation tool reads the actual customer message; it does not accept a model-supplied approval argument.

A decline leaves the purchased quantity available for a later proposal. Confirmation records an exchange and reduces replacement stock. A fresh conversation does not reset those records. Use a new isolated store to repeat the full example after consuming the purchased quantity.

For a quality review example, start a conversation and ask:

> The sole of the shoes in order-1001 separated after one wear. Can I exchange them for size 9?

The product-problem path saves a referral in the fictional quality team's queue before the agent says it referred the request. This does not contact a real department, approve the exchange, or change inventory.

The store uses a fixed clock for repeatable examples. Payments, shipping, customer sessions, and store data are fictional. This is not a production authentication or payment implementation.

## How the code fits together

| Responsibility | Code |
| --- | --- |
| Agent instructions, tools, conversation memory, five-step limit | [agent.ts](../apps/retail/src/mastra/agent.ts) |
| Inventory filters and returned product identifiers | [inventory-tool.ts](../packages/exchanges/inventory-tool.ts) |
| Ownership, policy checks, quotes, approval, and duplicate protection | [store.ts](../packages/exchanges/store.ts) |
| Jev question and confidence-based handling | [client.ts](../packages/jev/client.ts) |
| Jev configuration and bounded retries | [setup.ts](../packages/jev/setup.ts) |
| Jev response validation | [response.ts](../packages/jev/response.ts) |
| Eligibility, judgment, and handling paths | [flow.ts](../packages/exchanges/flow.ts) |
| Saved quality referrals | [quality-review.ts](../packages/exchanges/quality-review.ts) |
| Workflow suspension and resumption | [workflow.ts](../packages/exchanges/workflow.ts) |
| Chat tools and saved conversation-to-workflow association | [tool.ts](../packages/exchanges/tool.ts) |
| Customer reply parsing | [confirmation.ts](../packages/exchanges/confirmation.ts) |
| Structured final response schema | [response.ts](../packages/exchanges/response.ts) |

Policy checks and arithmetic run in code. Jev identifies the reported issue; its answer does not establish eligibility or authorize an exchange. The 0.8 confidence threshold is an example, not a calibrated production cutoff.

Approval is tied to the customer and exact proposal. The service rechecks eligibility, stock, quote expiration, and price before committing. Repeating a committed request with the same ID and matching proposal returns its saved receipt. A completed chat confirmation clears its pending link, so another confirmation in chat has no request to resume.

## Structured output

Studio uses conversational replies. The same agent can return a structured answer when the caller supplies a schema. Run this paid example:

```bash
npm run example:structured-response -- --customer customer-alex --message "For order-1001, the shoes are too small and squeeze my toes. Can I exchange them for size 9?"
```

The script creates isolated data, calls `agent.generate` with `structuredOutput.schema`, and reads `result.object`. It compares proposal fields with the tool result. The customer option selects a simulated identity for this local example; a deployed service must use its authenticated session.

## Verification commands

| Command | Scope | Provider calls |
| --- | --- | --- |
| `npm run check` | TypeScript, offline tests, credential scan | No |
| `npm run verify:exchange-agent` | Tools, instructions, memory settings, step limit | No |
| `npm run verify:exchange-services` | Approval requirements, decline, policy rejection, duplicate prevention | No; labeled decision test double |
| `npm run verify:step-limit` | Deterministic five-step limit test | No |
| `npm run verify:jev` | Eight issue-classification cases | TypeSafe |
| `npm run verify:exchange-workflow` | Suspension, decline, confirmation | TypeSafe |
| `npm run verify:exchange-chat` | Conversational agent behavior and store outcomes | OpenAI and TypeSafe |
| `npm run verify:exchange-structured` | Structured answers compared with tool outcomes | OpenAI and TypeSafe |

Exchange verification scripts use isolated data. Generated databases and evidence stay under ignored `data/`. Provider calls incur charges. Run the Chapter 1 behavior rehearsal on the `chapter1` branch, whose instructions match those cases.

The original `npm run seed` reloads order-only fixtures; it is not an exchange setup command. Use `npm run dev:exchanges` or `npm run prepare:exchanges` for this branch.
