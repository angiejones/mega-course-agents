# Direct MCP tools compared with code mode

The same jacket/backpack request was run three times per approach with `openai/gpt-6-luna`. Both produced the expected three SKU pairs and totals in all runs. On this small catalog, direct calls used fewer tokens and completed sooner. Code mode kept the twelve unselected variant IDs out of the captured model inputs.

## Results

| Run | Approach | Correct | Model steps | MCP calls | Variant IDs in model inputs | Total tokens | Elapsed seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | direct | Yes | 3 | 10 | 16 | 2830 | 7.6 |
| 1 | code | Yes | 3 | 20 | 4 | 4587 | 34.1 |
| 2 | code | Yes | 3 | 20 | 4 | 4554 | 23.5 |
| 2 | direct | Yes | 3 | 10 | 16 | 2824 | 7.3 |
| 3 | direct | Yes | 3 | 10 | 16 | 2765 | 7.2 |
| 3 | code | Yes | 3 | 20 | 4 | 4649 | 24.2 |

## Method and limits

Run `npm run compare:code-mode`. The script uses isolated agents with the same model, catalog, request, common task instructions, fresh context and 12-step limit. No memory, skills, workspace or unrelated retail tools are registered. Direct mode exposes the two actual discovered MCP shopping tools. Code mode uses the existing shopping adapter and its generated tool instructions. This tests the shopping strategy, not the full Studio agent conversation. Strategy order alternates between repetitions.

Both agents receive a final-message JSON format for automated checking. The format is explicitly scoped to the final message, not program return values. Correctness requires exact ordered SKU pairs and totals, with ties broken by SKU. The catalog has eight products and sixteen variants. Four distinct variants form the three selected pairs.

Each code-mode run first returned an extra totalCents field that the adapter's strict pair schema rejected. The model then retried with only the two SKU fields. Both attempts fetched the catalog, producing twenty MCP calls rather than ten. The retry and its tokens are included. This is an observed limitation of the current adapter/model combination, not a necessary property of code mode.

Total tokens are Mastra's reported aggregate input and output usage, including code and reasoning where reported. They are not a bill or a measure of product-data size. Elapsed times include provider and tool latency, and vary with caching and service conditions. Three runs per approach do not establish a general speed or token advantage. Provider inputs are captured to distinguish what the model saw from intermediate tool data visible in traces.

The initial comparison also produced correct results, but the final-message formatting instruction was less explicit and code mode retried one or two times. That evidence remains at `data/code-mode-comparison/86025ae9-3bb0-4af5-bad6-28cf9ef9dfa5/evidence.json`. The lesson uses the complete repeated comparison after clarifying the formatting instruction, not a selected successful run.

Final evidence: `/Users/angie/workspace/mega-course-agents/data/code-mode-comparison/2a5766ec-2d69-4586-baa6-e2c27b3226bd/evidence.json`.

## Teaching conclusion

Teach where the intermediate processing happens and measure the tradeoff. This request does not establish a need for code mode or a token saving. Direct calls worked efficiently here. Code mode exposed fewer intermediate records to the model, while its generated code and retries added overhead. Larger or different tasks require their own comparison.
