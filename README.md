# MEGA course agents

Build a retail customer service agent with TypeScript and Mastra. The `chapter2` branch includes exchanges with inventory lookup, deterministic policy checks and quotes, Jev classification, structured responses, and customer confirmation. Exchanges are always enabled. Use the `chapter1` branch for the earlier agent implementation; save local changes before switching branches.

## Local setup

Use Node **22.23.3** and npm **10.9.9**. With nvm installed:

```bash
nvm install
nvm use
npm install --global npm@10.9.9
npm ci
```

Create `.env.local` from `.env.example` only if you don't already have one. Set your own `OPENAI_API_KEY` and `TYPESAFE_API_KEY` there. Create the TypeSafe key in the [TypeSafe console](https://console.typesafe.ai/). A supplied environment variable also works, including a Codespaces secret. Never share your key. The instructor's key isn't included.

```bash
npm run prepare:exchanges
npm run check
npm run verify:exchange-agent
```

To create fresh exchange data and start Studio with it, run this in a separate terminal:

```bash
npm run dev:exchanges
```

Each run creates a new isolated store and automatically sets its database paths for Studio. Stop Studio with **Control+C** before starting a new session. Existing stores are preserved. Use `npm run prepare:exchanges` when you only need to prepare data without starting Studio.

Open http://localhost:4111, select **Retail customer service**, and ask:

> The blue shoes in order-1001 squeeze my toes. Can I exchange them for size 9?

The agent should look up the order and replacement, prepare a proposal, and ask for `1` to confirm or `2` to decline. Reply in the same chat. Studio replies conversationally. Run `npm run example:structured-response -- --customer customer-alex --message "For order-1001, the shoes are too small and squeeze my toes. Can I exchange them for size 9?"` for a separate, paid call that returns JSON using the same agent and fresh isolated data. Services and payments are fictional. The simulated session is Alex; claiming to be Sam in chat does not change identity. `order-1002` belongs to Sam and must not be returned.

Use **Control+C** in the server terminal to stop Studio. This checkpoint starts no other services. Keep Codespaces forwarded ports private.

## Chapter 1 walkthrough

On the `chapter1` branch, follow [Chapter 1: Agentic Primitives](docs/chapter-1.md) for the instruction, memory, and tool comparisons. Run `npm run rehearse:chapter1` to save isolated evidence and traces.

## Chapter 2 walkthrough

See [Chapter 2: Exchange capabilities](docs/chapter-2.md) for setup, examples, the code map, and checks. This branch contains the completed implementation.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependencies. |
| `npm run prepare:exchanges` | Create a new isolated exchange store and print its paths. |
| `npm run verify:exchange-agent` | Check default tools, instructions, response schema, and step limit without model calls. |
| `npm run seed` | Reload the original order-only fixtures; do not use it to reset an exchange store. |
| `npm run reset -- size-exchange` | Restore the scenario without removing traces. |
| `npm run dev` | Start Mastra Studio. |
| `npm run dev:exchanges` | Create fresh exchange data and start Studio with it. |
| `npm run health` | Check credentials are present, fixture data, and Studio availability. |
| `npm run chat -- "Look up order-1001"` | Run a paid agent request from the terminal. |
| `npm run check` | Run TypeScript, offline ownership/reset tests, and a credential scan. |
| `npm run eval` | Run a paid owned-order test and verify its trace was saved. Resets the store fixtures first. |
| `npm run verify:models` | Make paid tool-call and structured-output checks with both models. |

## Codespaces

The dev container pins Node and npm, installs locked dependencies, seeds the store, and runs offline checks. Add your own `OPENAI_API_KEY` as a Codespaces secret scoped to this repository, then restart the Codespace if necessary. Add `TYPESAFE_API_KEY` for Chapter 2 as well. Run `npm run dev:exchanges` yourself and open the private forwarded port 4111.

Container support is configured but not yet verified in a fresh Codespace. See [setup verification](docs/setup-verification.md) for tested paths and remaining checks.

## Repository layout

- `apps/retail/src/mastra`: Retail agent, tools, workflow registration, and tracing configuration.
- `packages/exchanges`: Exchange service, inventory tool, confirmation workflow, and response schema.
- `packages/store`: SQLite store access with ownership checks.
- `fixtures`: Fictional orders. No real customer records.
- `scripts`: Setup, health, model checks, and chat commands.
- `evals`: Course evaluation notes; initial executable check is `scripts/eval.ts`.
- `services`, `agents`, and `skills`: Reserved for later chapters; not implemented yet.

## Configuration and costs

`.env.example` documents model IDs, database paths, customer identity, and future service URLs. Defaults use `openai/gpt-6-luna` for the smaller model and `openai/gpt-6-sol` for the more capable model. Both were checked for tool calls and structured output; verification details are in the setup report.

Live agent calls and model checks bill your OpenAI and TypeSafe accounts as applicable. Offline checks don't call a provider. Live commands print token usage; full rehearsal costs have not yet been measured. Check your provider usage dashboard for actual charges.

Orders and explicitly saved preferences live in `data/store.db`; conversation history and traces live in `data/agent.db`. `CUSTOMER_ID` selects the customer for the local application's tools, in both Studio and terminal calls. The exchange service enforces eligibility and confirmation in code.

Mastra's built-in working memory and semantic recall are disabled. The agent receives the latest 20 messages from its current thread. Custom `savePreference` and `readPreference` tools provide persistence across threads when a customer asks to save a shopping preference. The schema accepts shopping categories, and the instructions require an explicit save request. Order IDs are not a supported preference category.

To clear saved preferences, run `npm run reset:preferences`, then refresh Studio and start a new thread. The reset preserves orders, threads, and traces. Old Mastra working-memory records and the earlier shoe-only `preferences` table are left intact but aren't used by this implementation. Current preferences use the separate `customer_preferences` table; old records are not imported.

## Credentials

`.env.local`, databases, logs, and build output are ignored by Git. Keep the template's key empty. Run `npm run check:secrets` before sharing changes; it checks tracked and shareable untracked files without printing secret values. This is a useful check, not a guarantee against every possible credential format. Never put keys in fixtures, screenshots, terminal recordings, or browser code.

## Troubleshooting

- Missing exchange fixtures: stop Studio and run `npm run dev:exchanges` for a fresh isolated store.
- Failed model request: check key validity, billing, and access to the configured model IDs.
- Studio stopped: use `npm run dev:exchanges` for a fresh session, or follow the guide to resume an existing store.
- SQLite warning: Node 22 labels its built-in SQLite API experimental; tests still verify its behavior.
- Trace storage warning about metrics: LibSQL stores traces here, but aggregate metrics require an analytics storage backend in the reliability chapter.
