# Large-catalog code-mode comparison

The expanded catalog has 240 products, 720 variants and 1,741 eligible jacket/backpack combinations under $150. It is reproducible generated test data, using the same record fields as the small catalog. The request is unchanged.

Three sequential runs per approach used the same configured model (`openai/gpt-6-luna`), fresh contexts, no skills, a 12-step limit and the same MCP server tools. Order alternated between approaches. Code mode averaged **94.8% fewer total tokens** and **65.0% less elapsed time**. Code mode was correct in all three runs; direct tools were correct in two.

## Complete final results

| Repeat | Approach | Correct | Input tokens | Output tokens | Total tokens | Seconds | Model steps | MCP calls | Model tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | direct | Yes | 52,998 | 2,431 | 55,429 | 24.73 | 4 | 8 | 8 |
| 1 | code | Yes | 2,351 | 539 | 2,890 | 6.91 | 2 | 8 | 1 |
| 2 | code | Yes | 2,445 | 639 | 3,084 | 7.88 | 2 | 8 | 1 |
| 2 | direct | No | 53,004 | 2,002 | 55,006 | 20.87 | 4 | 8 | 8 |
| 3 | direct | Yes | 66,072 | 2,113 | 68,185 | 22.82 | 4 | 8 | 8 |
| 3 | code | Yes | 2,539 | 738 | 3,277 | 9.18 | 2 | 7 | 1 |

Average total tokens were 59,540 for direct tools and 3,084 for code mode. Average elapsed times were 22.81 and 7.99 seconds.

Direct mode exposed all 720 variant IDs to the model. Code mode exposed only the four variants used in the selected pairs. Each final code-mode run used one execution call, without an output-validation or execution retry. Each approach fetched the full catalog through MCP. Both had batch reads of up to 50 product IDs, avoiding a baseline that requires 240 individual requests. The code-mode run with seven MCP calls combined category lists before batching; eight calls resulted from batching each category separately.

The independently calculated expected totals are $88.00, $89.53 and $92.10. The incorrect direct-tools answer selected a $92.87 third pair even though the $92.10 pair was present in its retrieved data. The comparison script exits nonzero for that genuine correctness failure; its assertion was not weakened. All six results were captured before the assertion.

## Fixes and test conditions

- The adapter now ignores extra fields in returned SKU pairs and rebuilds prices, stock and product details from records fetched during execution. A regression test supplies a fabricated total and stock value and verifies that trusted values replace them. Invented, unfetched, unavailable and duplicate products remain rejected.
- Execution failures now receive an execution error instead of the misleading output-format error. Raw error text is not forwarded, to avoid leaking intermediate product data.
- Both approaches receive the same explicit 50-ID batch limit. Code-mode instructions also describe that tool constraint. The model still chooses and writes its own filtering, pairing and ranking code; no precomputed answer is supplied.
- Final answers use the same JSON format for automated checking. The format is scoped to the final message, separate from program return values.
- The large fixture is selected only with `--large` or `SHOPPING_CATALOG_PATH`. Studio defaults to the small catalog. The storyboard selects the large catalog through `SHOPPING_CATALOG_PATH` for Lesson 4 recording. No standing retail system instructions were changed.

## Reproduce

Generate the catalog with `node --import tsx scripts/build-large-catalog.ts`, then run `npm run compare:code-mode -- --large` in the documented Node 22 environment. The test starts and closes its own bounded local MCP fixture and records each result before moving to the next.

Final evidence: `/Users/angie/workspace/mega-course-agents/data/code-mode-comparison/a3baf969-98bb-4f1e-8e19-93cf6dd29704/evidence.json`.

The same directory contains a catalog snapshot. Its SHA-256 is `20ffae9f7752f3b65b78bb7304dd89166ac46399aa9b783b70de28641b23433a`.

Earlier exploratory runs exposed the MCP input-schema compatibility issue and a generated program exceeding the batch limit. They were stopped during diagnosis and are not part of the final timing comparison. Their partial evidence remains in the comparison data directories, including `52ebcc65-12be-440b-ae60-82c2474a118b`. The six final measured calls ran sequentially after the exploratory processes were stopped.

## Interpretation

This is a compelling example of processing larger intermediate tool results in code. It demonstrates substantial token and elapsed-time savings on this catalog and task, with correct code-mode answers in all measured runs. It is still only three runs per approach, on local MCP tools and generated catalog data. Reported token counts include input, generated code, output and model reasoning as reported by Mastra. They are not a monetary bill; caching and provider conditions can affect costs and timing. This does not establish that code mode beats a purpose-built server-side search or ranking tool.

Validation passed type checking, all 31 offline tests and the secret scan. The final evidence was separately checked for code-mode correctness, one execution per request, no unselected variants reaching the model, and all 720 variants reaching direct mode.
