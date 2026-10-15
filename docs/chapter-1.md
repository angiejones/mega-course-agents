# Chapter 1: Agentic Primitives

Start Studio with `npm run dev`. This chapter uses Alex's simulated customer session. Identity is fixed by application configuration, not by a name typed into chat. All store data is fictional.

There is one agent throughout this chapter: **Retail customer service**. Change its configuration in `apps/retail/src/mastra/agent.ts`, run the same request again, and compare the results. These are edits to one agent, not separate agents or a multi-agent system.

Start a new thread after each configuration change so an earlier answer doesn't influence the comparison. Wait for Studio to reload, then refresh its page and inspect the updated instructions or tool list before running the request.

## Run the agent and inspect the loop

Ask **Retail customer service**:

> Can I exchange the shoes in order-1001 for a larger size?

Expected behavior: retrieve the blue sneaker in size 8, ask for the desired replacement size, and explain that exchanges aren't implemented yet. Asking for a size does not approve or create an exchange.

Exchange instructions also handle a change of color or a different product. For example, "Can I exchange the blue shoes in order-1001 for brown ones in the same size?" should retain size 8 from the verified order and acknowledge brown without asking for a size again. "I would like to exchange the blue shoes in order-1001 for a black jacket in medium" should recognize the requested jacket and its size. The agent must not invent a replacement SKU or claim that a requested item is available.

If the customer only asks to exchange an item without specifying a replacement, the agent asks what they want instead. It asks only for relevant details that are missing, after resolving which purchased item is involved. It still cannot check inventory, approve an exchange, or create one.

Open **Traces** and inspect the user request, first model call, `getOrder` arguments, tool result, second model call, and final answer. The run ends to ask for information; no approval workflow runs in this chapter.

Mastra defaults to five model steps when callers do not supply a limit. Studio can supply its own value; set Model settings → Advanced Settings → Max Steps to 5 for the lesson. A step can request multiple tools. The limit applies separately to each run.

## Change instructions

Run this request with the retail agent:

> Can I exchange the shoes in order-1003 for a larger size?

That order contains a blue everyday sneaker and a red running shoe. The agent should name both candidates and ask the customer to choose, then stop. It should not preview its next question or add a capability disclaimer to the item-selection question.

In `agent.ts`, replace the whole `exchangeInstruction` value with:

> For exchange requests, say that you cannot process exchanges. Respond directly without calling tools or asking for an order number, item choice, or replacement details. If the customer separately asks for order information, help with that lookup.

This replaces the original exchange guidance, including its use of `clarificationInstruction`, rather than adding a conflicting instruction. Save the file, let Studio reload, and repeat the same request in a new thread. The agent should explain the limitation without asking the customer for details it cannot use. Keep this change for the remaining lessons.

The model and tools stay the same. Compare the behavior, not the exact wording. System instructions guide each model call but do not guarantee compliance, so retain and investigate unexpected results.

## Context versus persistent information

Keep `workingMemory.enabled: false`, `semanticRecall: false`, and `lastMessages: 20`. In a new thread, say:

> Call my shopping trip Coral Comet.

Ask in the same thread, "What did I call my shopping trip?" It should recall the name from conversation history. Ask in a new thread; it should not know the name.

In another new thread, ask "What is my preferred shoe size?" Inspect the `readPreference` result before saving. After the recording reset, it should return `found: false`.

> Please remember my preferred shoe size is 9.

Inspect `savePreference` in the trace. Its input should contain category `shoe_size` and value `9`; its result should confirm `saved: true`. Ask about the preferred shoe size in another new thread and inspect `readPreference` returning `9`.

These are custom tools backed by `customer_preferences` in `data/store.db`, not Mastra's built-in working memory. Studio's Working Memory panel doesn't display this table. Both Studio and terminal tools use the application-configured `CUSTOMER_ID`. The table separates customers and preference categories. The tool schema accepts shopping categories; the instructions tell the model to save only on an explicit request. Do not describe those instructions as a deterministic consent check.

Order numbers and replacement sizes from an exchange request must not be saved as preferences. Start a fresh thread after discussing an order and ask "What did I buy in my order?" It should ask for the order number again. A remembered preference doesn't identify the next order or authorize an exchange.

## Remove a tool

In `apps/retail/src/mastra/agent.ts`, change `customerServiceConfig.orderLookup` from `true` to `false`. Keep the instructions unchanged. Save the file, wait for Studio to reload, and refresh its page. Inspect the tool list for **Retail customer service**: `readPreference` and `savePreference` remain, but `getOrder` is absent.

Start a fresh thread with **Retail customer service** and ask "What did I buy in order-1001?". The agent should explain that it cannot verify the order. Compare this trace with the same agent's earlier trace when order lookup was available. Instructions explain what to do; the lookup tool supplies evidence from the store.

Restore `customerServiceConfig.orderLookup` to `true`, save the file, and wait for Studio to reload. Refresh its page and confirm that `getOrder` is available again before continuing.

## Save evidence

The reusable cases in `evals/chapter1-cases.json` cover ownership and item clarification, along with different kinds of exchange requests. These include a color change with the original size retained and a switch to a different product. They also check an explicitly supplied size, an unspecified replacement, and an identified item in an order containing multiple items. Each case identifies the original or revised exchange configuration it tests. The revised cases require the agent to stop collecting exchange details while still answering direct order questions. Expected outcomes describe behavior, not an exact sentence.

```bash
npm run rehearse:chapter1
```

This paid rehearsal also changes and restores the same agent’s instruction and tool configuration to test their effects, same-thread context, a fresh thread, and explicit preference persistence. It creates an isolated store and trace database under `data/chapter1/<run-id>/`, leaving your Studio data untouched. Each result records the request, answer, tool results, step count, finish reason, token usage, and persisted trace ID in `evidence.json`. Failed rehearsals retain results too.

To inspect an isolated run's traces in Studio, first stop the existing server, then start it from the repository root with that run's paths:

```bash
STORE_DB_PATH=data/chapter1/<run-id>/store.db AGENT_DB_PATH=data/chapter1/<run-id>/agent.db npm run dev
```

Replace `<run-id>` with the ID printed by the rehearsal. Stop that server afterward and run ordinary `npm run dev` to return to the default course data.

## Reset for another take

- `npm run reset -- size-exchange` restores fictional orders and preserves preferences and threads.
- `npm run reset:preferences` clears custom preferences for the configured customer, for both Studio tools and terminal tools. Refresh Studio after code changes and start a new thread. Existing built-in working-memory records are ignored while that feature is disabled; existing chat messages remain available within their original thread.
- Start a new thread to demonstrate fresh conversation context. Old threads and traces remain available as evidence.

`npm run verify:step-limit` uses a deterministic test model that requests a lookup at every step and verifies the agent stops after exactly five steps and five successful lookups. It uses isolated data and makes no paid model calls. An empty final answer is expected when the run ends at the limit. The live rehearsal separately checks behavior with the configured model.

Before recording, verify the five-step setting in Studio and run the saved cases. There is no return eligibility, inventory check, approval, or exchange mutation in this checkpoint.
