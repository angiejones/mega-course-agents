# Comparison using Mastra's standard code-mode setup

## Implementation

`createShoppingCodeMode` now passes the discovered product search and variant tools to `createCodeMode`, using the standard `QuickJsCodeModeTransport`. It retains the 10-second execution limit and 32 MB memory limit. The returned tool and generated instructions are registered with the retail agent without modifying their wording.

Removed the custom tool description, the shopping-specific instruction block, the separate direct-versus-code routing sentence, and the custom CatalogTransport. Generated programs can return ordinary values; no SKU-pair schema or three-pair limit is imposed by the host. The host no longer reconstructs prices, validates selected combinations, or discards console output. Standard execution errors and logs follow Mastra's transport behavior. Underlying MCP tool schemas and the sandbox's tool allowlist remain enforced. Variant batching remains inside the MCP tool.

The customer supplies the size, budget and requested number of combinations. The comparison no longer supplies additional budget, filtering or sorting instructions. Both strategies receive the same final-answer JSON formatting instruction so the evaluator can check exact results. That instruction is confined to the test harness; it is not installed on the retail agent or imposed on the program's return value.

## Results

Same request, 240 products and 720 variants. Three sequential runs per approach, alternating order, using `openai/gpt-6-luna`, fresh contexts, skills disabled and a 12-step limit.

| Measure | Direct tools | Code mode |
| --- | --- | --- |
| Average total tokens | 51,537 | 2,106 |
| Average time | 20.54 seconds | 5.64 seconds |
| Correct answers | 1/3 | 3/3 |
| Model steps | 3 | 2 |
| MCP calls | 4 | 3 |
| Variants reaching the model | 720 | 4 |

Code mode used 95.9% fewer total tokens and 72.5% less elapsed time on average. Each code-mode run used one execution call with no retry. It combined both categories into one variant request; direct mode requested variants separately for each category. Correctness is evaluated independently against exhaustive catalog calculations, not supplied by the removed return adapter.

| Repeat | Approach | Correct | Total tokens | Seconds |
| --- | --- | --- | --- | --- |
| 1 | direct | No | 51,523 | 21.32 |
| 1 | code | Yes | 2,072 | 5.63 |
| 2 | code | Yes | 2,112 | 5.38 |
| 2 | direct | No | 51,391 | 17.73 |
| 3 | direct | Yes | 51,697 | 22.56 |
| 3 | code | Yes | 2,134 | 5.92 |

The expected totals are $88.00, $89.53 and $92.10. Direct run 1 returned $88.00, $92.87 and $93.79. Direct run 2 returned $92.87, $93.79 and $94.55. Direct run 3 and all code-mode runs returned the exact expected pairs and totals. The comparison completed all six runs and exited nonzero because two direct answers failed the retained correctness assertion.

Type checking, all 31 offline tests and the secret scan passed. Tests for the removed shopping return contract were replaced with tests of general return values and standard error/log behavior. Existing budget, MCP access, full-catalog reads, sandbox and timeout checks remain. Evidence was separately checked for three correct code-mode answers, one execution each and no unselected variant IDs in model inputs.

These measurements cover three runs per approach with generated catalog data and local MCP tools. Timing varies with provider conditions and token savings are not measured billing savings. This does not establish that code mode outperforms a purpose-built server-side ranking tool. General code-mode outputs are model-authored calculations; successful execution alone does not validate the answer.

Reproduce with `npm run compare:code-mode -- --large` in the documented Node 22 environment.

Evidence: `/Users/angie/workspace/mega-course-agents/data/code-mode-comparison/4e4c51d4-08c3-45cc-9ab8-c82e1bc6d54d/evidence.json`.

The full retail agent also passed both small-catalog live regression cases with skills disabled: the correct three combinations and a budget with no eligible combinations. Final-answer correctness, stock, size, totals and model-input visibility were checked independently. Evidence: `data/code-mode/8524ee21-b5dd-4531-9cd5-8547abe7fab2/evidence.json`. These regression calls ran after the measured comparison.

The storyboard and slides were left unchanged as requested. Their custom-adapter explanation and earlier measurements do not describe this simplified implementation yet.
