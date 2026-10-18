# Code-mode comparison with internal batching

The variant tool now accepts all requested product IDs in one call and processes them internally in groups of 50. This is application code, not an MCP requirement. The catalog is still loaded from a local fixture; the internal batches group lookups in that catalog, not remote database requests. Callers receive the combined result. The model-facing schema, description, code-mode instructions and shared comparison instructions no longer impose a 50-ID limit.

The same 240-product, 720-variant catalog and shopping request were tested three times per approach with `openai/gpt-6-luna`, skills disabled, fresh contexts and a 12-step allowance. Approaches alternated and ran sequentially. Both received the same final-answer format for exact grading. Only shopping tools were supplied, so this isolates the strategy rather than measuring the full Studio agent.

| Measure | Direct tools | Code mode |
| --- | --- | --- |
| Average total tokens | 51,708 | 2,781 |
| Average elapsed time | 21.57 seconds | 8.41 seconds |
| Correct top-three rankings | 0/3 | 3/3 |
| MCP calls per run | 4 | 4 |
| Model steps per run | 3 | 2 |
| Variants reaching model input | 720 | 4 |

Code mode used 94.6% fewer total tokens and 61.0% less elapsed time on average. All three code-mode runs used one execution call without retries.

## Individual runs

| Repeat | Approach | Correct | Total tokens | Seconds |
| --- | --- | --- | --- | --- |
| 1 | direct | No | 51,852 | 23.43 |
| 1 | code | Yes | 2,860 | 11.89 |
| 2 | code | Yes | 2,859 | 7.59 |
| 2 | direct | No | 51,674 | 21.95 |
| 3 | direct | No | 51,598 | 19.33 |
| 3 | code | Yes | 2,625 | 5.75 |

The correct totals are $88.00, $89.53 and $92.10. Direct mode chose a $92.87 third pair twice and a $93.79 pair once. It had retrieved the correct cheaper pair's data. The comparison completed all six runs, then exited nonzero because of those incorrect answers. The correctness assertion was retained.

Type checking, all 32 offline tests and the secret scan passed. The new regression sends all 240 product IDs through a single MCP call and checks all 720 returned records against the fixture. It also checks that an unknown ID beyond the first internal batch is rejected. The final comparison evidence independently confirms that each code-mode run was correct, used one execution call and kept unselected variants out of model inputs.

These are three runs per approach on generated catalog data and local MCP tools. Timing varies with provider conditions, token totals are not a bill, and success here does not guarantee future generated programs will be correct. This does not compare against a purpose-built server-side ranking tool.

Reproduce with `npm run compare:code-mode -- --large` in the documented Node 22 environment. Restart Studio to load the changed MCP tool before rehearsing, reconnect any existing MCP clients and use a fresh conversation.

Evidence: `/Users/angie/workspace/mega-course-agents/data/code-mode-comparison/392143f1-1718-4278-ad86-f03b9ee68a96/evidence.json`.

The prior report in `large-code-mode-comparison.md` retains the earlier measurement with caller-managed batching. The lesson and slide still quote that earlier measurement; they were not rewritten during this implementation and comparison run.
