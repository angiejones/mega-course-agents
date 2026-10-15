# MEGA course agents

Build a retail customer service agent with TypeScript and Mastra. This checkpoint provides a Chapter 1 order lookup agent, fictional SQLite data, and locally stored traces. Exchanges, MCP services, A2A specialists, skills, and later-chapter evals will be added in subsequent checkpoints.

## Local setup

Use Node **22.23.3** and npm **10.9.9**. With nvm installed:

```bash
nvm install
nvm use
npm install --global npm@10.9.9
npm ci
```

Create `.env.local` from `.env.example` only if you don't already have one. Set your own `OPENAI_API_KEY` there. A supplied environment variable also works, including a Codespaces secret. Never share your key. The instructor's key isn't included.

```bash
npm run seed
npm run check
npm run health
```

Start Studio in a separate terminal:

```bash
npm run dev
```

Open http://localhost:4111, select **Retail customer service**, and ask:

> Can I exchange the shoes in order-1001 for a larger size?

The agent should look up the blue size-8 sneaker and explain that it cannot perform an exchange yet. It can also clarify requests for a different color or product. For example, asking for brown shoes in the same size should retain size 8 from the verified order. It cannot check whether that replacement is available. Open its trace to inspect the model and tool calls. The simulated session is Alex; claiming to be Sam in chat doesn't change identity. `order-1002` belongs to Sam and must not be returned.

Use **Control+C** in the server terminal to stop Studio. This checkpoint starts no other services. Keep Codespaces forwarded ports private.

## Chapter 1 walkthrough

Follow [Chapter 1: Agentic Primitives](docs/chapter-1.md) for the instruction, memory, and tool comparisons. Run `npm run rehearse:chapter1` to save isolated evidence and traces.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependencies. |
| `npm run seed` | Load the fictional size-exchange scenario. |
| `npm run reset -- size-exchange` | Restore the scenario without removing traces. |
| `npm run dev` | Start Mastra Studio. |
| `npm run health` | Check credentials are present, fixture data, and Studio availability. |
| `npm run chat -- "Look up order-1001"` | Run a paid agent request from the terminal. |
| `npm run check` | Run TypeScript, offline ownership/reset tests, and a credential scan. |
| `npm run eval` | Run a paid owned-order test and verify its trace was saved. Resets the store fixtures first. |
| `npm run verify:models` | Make paid tool-call and structured-output checks with both models. |

## Codespaces

The dev container pins Node and npm, installs locked dependencies, seeds the store, and runs offline checks. Add your own `OPENAI_API_KEY` as a Codespaces secret scoped to this repository, then restart the Codespace if necessary. Run `npm run dev` yourself and open the private forwarded port 4111.

Container support is configured but not yet verified in a fresh Codespace. See [setup verification](docs/setup-verification.md) for tested paths and remaining checks.

## Repository layout

- `apps/retail/src/mastra`: Chapter 1 agent, order tool, and tracing configuration.
- `packages/store`: SQLite store access with ownership checks.
- `fixtures`: Fictional orders. No real customer records.
- `scripts`: Setup, health, model checks, and chat commands.
- `evals`: Course evaluation notes; initial executable check is `scripts/eval.ts`.
- `services`, `agents`, and `skills`: Reserved for later chapters; not implemented yet.

## Configuration and costs

`.env.example` documents model IDs, database paths, customer identity, and future service URLs. Defaults use `openai/gpt-6-luna` for the smaller model and `openai/gpt-6-sol` for the more capable model. Both were checked for tool calls and structured output; verification details are in the setup report.

Live demos and model checks bill your OpenAI API account. Offline checks don't call a provider. Live commands print token usage; full rehearsal costs have not yet been measured. Check your provider usage dashboard for actual charges.

Orders and explicitly saved preferences live in `data/store.db`; conversation history and traces live in `data/agent.db`. `CUSTOMER_ID` selects the customer for the local application's tools, in both Studio and terminal calls. This checkpoint has no return eligibility logic.

Mastra's built-in working memory and semantic recall are disabled. The agent receives the latest 20 messages from its current thread. Custom `savePreference` and `readPreference` tools provide persistence across threads when a customer asks to save a shopping preference. The schema accepts shopping categories, and the instructions require an explicit save request. Order IDs are not a supported preference category.

Run `npm run reset:preferences` before recording, then refresh Studio and start a new thread. The reset preserves orders, threads, and traces. Old Mastra working-memory records and the earlier shoe-only `preferences` table are left intact but aren't used by this implementation. Current preferences use the separate `customer_preferences` table; old records are not imported.

## Credentials

`.env.local`, databases, logs, and build output are ignored by Git. Keep the template's key empty. Run `npm run check:secrets` before sharing changes; it checks tracked and shareable untracked files without printing secret values. This is a useful check, not a guarantee against every possible credential format. Never put keys in fixtures, screenshots, terminal recordings, or browser code.

## Troubleshooting

- Missing order: run `npm run seed` from the repository root.
- Failed model request: check key validity, billing, and access to the configured model IDs.
- Studio stopped: start `npm run dev` in a separate terminal.
- SQLite warning: Node 22 labels its built-in SQLite API experimental; tests still verify its behavior.
- Trace storage warning about metrics: LibSQL stores traces here, but aggregate metrics require an analytics storage backend in the reliability chapter.
