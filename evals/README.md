# Evaluations

Run `npm test` for this branch's offline tests. Run `npm run verify:step-limit` to check its model-step limit without calling a provider.

Use the `chapter1` branch for `npm run eval` and `npm run eval:chapter1`. Those checks use the Chapter 1 agent and order fixtures. The chapter evaluation saves isolated data, results, and traces under `data/chapter1/<run-id>/` and makes paid model calls.

For this branch's setup and verification commands, follow the chapter guides:

- [Chapter 2 exchange checks](../docs/chapter-2.md#verification-commands)
