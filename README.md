# MEGA course agents

Build a retail customer service agent with TypeScript and Mastra. Each chapter has its own branch with the code and instructions for that chapter. The `main` branch contains the Chapter 1 starting point.

## Choose your chapter

| Chapter | Branch | Instructions |
| --- | --- | --- |
| 1. Agentic primitives | [chapter1](https://github.com/angiejones/mega-course-agents/tree/chapter1) | [Run the agent, change instructions, and explore memory and tools](https://github.com/angiejones/mega-course-agents/blob/chapter1/docs/chapter-1.md) |
| 2. Exchange capabilities | [chapter2](https://github.com/angiejones/mega-course-agents/tree/chapter2) | [Inventory, policy checks, and customer confirmation](https://github.com/angiejones/mega-course-agents/blob/chapter2/docs/chapter-2.md) |
| 3. Agentic capabilities | [chapter3](https://github.com/angiejones/mega-course-agents/tree/chapter3) | [MCP, code mode, MCP Apps, and skills](https://github.com/angiejones/mega-course-agents/blob/chapter3/docs/chapter-3.md) |
| 4. Multi-agent collaboration | [chapter4](https://github.com/angiejones/mega-course-agents/tree/chapter4) | [Retail, carrier, supplier, and shopping agents](https://github.com/angiejones/mega-course-agents/blob/chapter4/docs/multi-agent-collaboration.md) |
| 5. Agent reliability | [chapter5](https://github.com/angiejones/mega-course-agents/tree/chapter5) | [Evaluations, guardrails, scoring, and costs](https://github.com/angiejones/mega-course-agents/blob/chapter5/evaluations/README.md) |

Save your changes with a commit or stash and stop any running course services before switching branches. From the repository directory, select the chapter you want, then install its dependencies:

```bash
git fetch origin
git switch chapter2
npm ci
```

Replace `chapter2` with the branch for your chapter. Follow that branch's README and chapter guide for setup and commands. Keep your existing `.env.local`; later chapters may require additional settings. The instructions below apply to the Chapter 1 code on `main`.

## Local setup

Use Node **22.23.3** and npm **10.9.9**. With nvm installed:

```bash
nvm install
nvm use
npm install --global npm@10.9.9
npm ci
```

Create `.env.local` from `.env.example` only if you don't already have one. Set your own `OPENAI_API_KEY` there. A supplied environment variable also works, including a Codespaces secret. Never share your key.

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

Follow [Chapter 1: Agentic Primitives](docs/chapter-1.md) for the instruction, memory, and tool comparisons. Run `npm run eval:chapter1` to save isolated evidence and traces.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependencies. |
| `npm run seed` | Load the fictional size-exchange scenario. |
| `npm run reset -- size-exchange` | Restore the scenario without removing traces. |
| `npm run reset:preferences` | Clear saved preferences for the configured customer. |
| `npm run dev` | Start Mastra Studio. |
| `npm run health` | Check credentials are present, fixture data, and Studio availability. |
| `npm run chat -- "Look up order-1001"` | Run a paid agent request from the terminal. |
| `npm run check` | Run TypeScript, offline ownership/reset tests, and a credential scan. |
| `npm run eval` | Run a paid owned-order test and verify its trace was saved. Resets the store fixtures first. |
| `npm run eval:chapter1` | Run paid Chapter 1 evaluations with isolated data and saved traces. |
| `npm run verify:step-limit` | Check the five-step limit without calling a provider. |
| `npm run verify:models` | Make paid tool-call and structured-output checks with both models. |

## Codespaces

The dev container pins Node and npm, installs locked dependencies, seeds the store, and runs offline checks. Add your own `OPENAI_API_KEY` as a Codespaces secret scoped to this repository, then restart the Codespace if necessary. Run `npm run dev` yourself and open the private forwarded port 4111.

Container support is configured but not yet verified in a fresh Codespace.

## Repository layout

- `apps/retail/src/mastra`: Chapter 1 agent, order tool, and tracing configuration.
- `packages/store`: SQLite store access with ownership checks.
- `fixtures`: Fictional orders. No real customer records.
- `scripts`: Setup, health, model checks, and chat commands.
- `evals`: Course evaluation notes; initial executable check is `scripts/eval.ts`.
- `services`, `agents`, and `skills`: Reserved for later chapters; not implemented yet.

## Configuration and costs

`.env.example` documents model IDs, database paths, customer identity, and future service URLs. Defaults use `openai/gpt-6-luna` for the smaller model and `openai/gpt-6-sol` for the more capable model.

Agent requests and live evaluations bill your OpenAI API account. Offline checks don't call a provider. Live commands report token usage in their output or saved results. Check your provider usage dashboard for actual charges.

Orders and explicitly saved preferences live in `data/store.db`; conversation history and traces live in `data/agent.db`. `CUSTOMER_ID` selects the customer for the local application's tools, in both Studio and terminal calls. This checkpoint has no return eligibility logic.

Mastra's built-in working memory and semantic recall are disabled. The agent receives the latest 20 messages from its current thread. Custom `savePreference` and `readPreference` tools provide persistence across threads when a customer asks to save a shopping preference. The schema accepts shopping categories, and the instructions require an explicit save request. Order IDs are not a supported preference category.

To clear saved preferences and repeat an exercise, run `npm run reset:preferences`, then start a new thread in Studio. The reset preserves orders, threads, and traces.

## Credentials

`.env.local`, databases, logs, and build output are ignored by Git. Keep the template's key empty. Run `npm run check:secrets` before sharing changes; it checks tracked and shareable untracked files without printing secret values. This is a useful check, not a guarantee against every possible credential format. Never put keys in fixtures, screenshots, logs, or browser code.

## Troubleshooting

- Missing order: run `npm run seed` from the repository root.
- Failed model request: check key validity, billing, and access to the configured model IDs.
- Studio stopped: start `npm run dev` in a separate terminal.
- SQLite warning: Node 22 labels its built-in SQLite API experimental; tests still verify its behavior.
- Trace storage warning about metrics: LibSQL stores traces here, but aggregate metrics require an analytics storage backend in the reliability chapter.
