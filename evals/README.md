# Evaluations

`npm run eval` checks a Chapter 1 order lookup and verifies that its trace was saved. It calls OpenAI and resets the fictional store first.

Run `npm test` for offline checks of order ownership, preference persistence, customer isolation, and resets. These checks also verify that automatic working-memory tools are disabled.

`npm run eval:chapter1` runs paid evaluations for order lookup, exchange instructions, conversation context, and explicitly saved preferences across threads. It uses isolated data and saves results and traces under `data/chapter1/<run-id>/`. See the [Chapter 1 walkthrough](../docs/chapter-1.md#run-the-chapter-evaluations) for how to inspect the results.

`npm run verify:step-limit` checks the five-step limit with a test model and makes no paid API calls.
