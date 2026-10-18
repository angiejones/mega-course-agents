# Setup verification — 2026-10-10

These sections record successive implementation checkpoints. The latest working-memory verification is at the end; earlier custom-preference results describe the retired implementation.

## Passed

- OpenAI authentication succeeded without displaying the key.
- `.env.local` is ignored, untracked, and restricted to its owner (0600).
- TypeScript checks and offline ownership/reset tests passed on Node 22.23.3 with npm 10.9.9.
- A clean source copy, with no credentials, installed from the lockfile, seeded the database, and passed `npm run check`.
- The Mastra build completed successfully on the pinned Node version.
- A real Chapter 1 agent call retrieved Alex's order through the tool. Its trace was read back from local storage.
- Both `openai/gpt-6-luna` and `openai/gpt-6-sol` called the tool and returned schema-validated structured output.
- The credential check found no keys in tracked or shareable untracked files.

## Observed usage

These are measured API token totals for small verification requests, not full lesson rehearsals or dollar estimates.

| Model / request | Input tokens | Output tokens |
| --- | ---: | ---: |
| GPT-6 Luna: Chapter 1 lookup | 461 | 61 |
| GPT-6 Luna: tool verification | 281 | 59 |
| GPT-6 Luna: structured output | 106 | 12 |
| GPT-6 Sol: tool verification | 281 | 68 |
| GPT-6 Sol: structured output | 106 | 24 |

Actual billed cost should be checked in the OpenAI project usage dashboard. Record complete rehearsal costs before publishing cost claims for students.

## Remaining verification

- Studio startup and browser trace walkthrough: passed after correcting database paths. Studio runs from a nested public directory; configuration now resolves the repository root before loading credentials and database paths. A regression test covers that directory. The browser scenario returned the owned sneaker order and a successful trace with model and tool spans.
- Fresh Codespaces/dev-container build: Docker was not running locally. Configuration is supplied, but container support is not yet verified.
- Chapter 2 confirmation and Chapter 3 elicitation interfaces: not implemented or tested in this setup checkpoint.
- Aggregate metrics: current LibSQL storage persists traces; add an analytics backend when implementing the reliability chapter. Mastra currently emits a metrics-storage warning.

## Dependency audit

A clean install reported 15 affected dependency entries: 9 moderate and 6 high (after adding memory). The underlying advisory chains involve `braces` and `sprintf-js`, pulled in by Mastra's tooling and Markdown dependencies. Their latest published versions were still affected at setup time. The audit's suggested force fixes would downgrade Mastra to incompatible releases; they were not applied. Recheck upstream fixes before distributing this checkpoint to students.

## Scope

This is a development foundation with an order-lookup agent. It does not implement exchanges, eligibility, MCP, A2A, skills, or later-chapter evaluations. Reserved directories are explicitly marked. No changes have been staged, committed, or pushed.

Tracing follows the [Mastra observability documentation](https://mastra.ai/docs/observability/overview). Versions are exact in `package.json`, with the resolved tree in `package-lock.json`.

## Chapter 1 additions

Added conversation history (20 messages per thread, no semantic recall or automatic working memory), consent-checked persistent shoe-size preferences, an ambiguous two-shoe order, and in-place instruction/tool configuration demonstrations. The default step limit is four and is visible in Studio's advanced model settings.

The ten-run Chapter 1 rehearsal passed. The isolated results and persisted trace database are under `data/chapter1/85546c38-5fc4-40c1-8108-0e55a99f21c8/`. It checked owned and unauthorized orders, ambiguous items, the earlier comparison configurations, same-thread and new-thread context, and preference recall across threads. Actual answers are retained in `evidence.json`; the reusable cases and expected outcomes are in `evals/chapter1-cases.json`.

A forced-tool diagnostic stopped at exactly four steps (trace `528477e42733972118f8221a77af30b1`). Studio's user signals needed a separate message-format handler for consent; a regression test now covers that format, ordinary user messages, and ignoring assistant/tool messages. Saving through Studio and retrieving that preference in a separate new thread were verified after this fix.

Use `docs/chapter-1.md` as the walkthrough. These checks do not complete the remaining Codespaces, full rehearsal cost, or upstream dependency work.

Chapter 1 now registers only `retailAgent`. The walkthrough edits its clarification instruction and order-lookup setting in place. The rehearsal changes those settings sequentially on the same agent and restores them afterward; earlier recorded runs used the superseded separate-agent arrangement.

The updated single-agent ten-run rehearsal passed; evidence and traces are retained in `data/chapter1/e1a086fa-b334-483a-a4fe-d6bca9d51161/`. Runtime registration was checked and contains only `retailAgent`. Offline tests, TypeScript, and credential checks also passed.


## Categorized customer preferences

Preferences now use a customer-and-category key, with a text value for each category. The save tool accepts category/value arguments and checks them against an explicit save command in the latest actual user message. This command parser supports multiple categories and values, but does not interpret arbitrary natural-language consent. Read requests can select one category or return all preferences for the current customer.

Existing shoe-size records migrate to the `shoe_size` category automatically, preserving the original consent text and timestamp. The reset command clears all categories for the configured customer.

TypeScript, all eight offline tests, and the credential check passed. Tests cover category isolation, independent updates, mismatched or unauthorized save requests, and migration with persistence across reopening. The expanded twelve-run live rehearsal also passed. It saved shoe size 9 and shirt size medium independently and retrieved each in a fresh thread. Evidence and traces are retained under `data/chapter1/0de462aa-7b4c-41c2-9101-35ba9c8df66f/`. This verifies the agent API path; the updated category inputs have not been manually exercised through Studio in this check.


## General exchange requests

The agent now clarifies replacement details for changes of color or product as well as size. It retains details already supplied by the customer and resolves “same size” against the verified purchased item. It asks what the customer wants instead when no replacement is specified. These instructions do not add inventory, eligibility, or exchange execution capabilities.

The first expanded rehearsal caught an unnecessary preference lookup with order lookup disabled. Its evidence is retained in `data/chapter1/0c8ded35-7b3b-4d67-b8bf-e2eeafa7d0a3/`. The instructions now reserve preference reads for explicit questions about saved preferences; the original no-tool-call assertion remains intact.

TypeScript, all eight offline tests, and the credential check passed. All eighteen live rehearsal scenarios then passed, and their responses were inspected. New coverage includes a color change in the purchased size, a replacement jacket, and a specified replacement size. It also covers unspecified replacements, an already identified item in a multi-item order, and retaining the purchased size despite a different saved preference. Evidence and traces are retained in `data/chapter1/f7b7f1b9-bbe2-494a-92ee-14b470f6d4e5/`. This verifies the agent API path; no manual Studio rehearsal was performed for this change.


## Built-in working memory

The custom preference tools and consent parser have been removed. The agent now uses Mastra's structured working memory with resource scope. Instructions guide it to retain general shopping preferences and exclude order facts or temporary conversation details. New threads for the same customer receive that record as context. This behavior is model-guided, not an application-enforced consent policy.

The reset command clears the configured customer's working memory through Mastra's storage API. It preserves order records and threads; use a fresh thread after resetting. Terminal callers now pass a customer resource ID and thread ID. Existing legacy preference tables are left intact but unused, with no automatic import.

TypeScript, the credential scan, and three offline tests passed. The working-memory integration test exercises the actual built-in update tool against isolated LibSQL storage. It checks merging preferences across threads, customer isolation, rejection of a mismatched thread/resource pair, reset isolation, retained orders and threads, and persistence after reopening storage. The old consent-parser tests were removed with that implementation.

The first live rehearsal retained correct preferences but made a redundant update when answering a recall question. Evidence is retained in `data/chapter1/aa69c5fa-bd65-4d45-9a66-2a0407edb4e0/`. The instructions were clarified to answer directly from existing memory and not rewrite unchanged preferences; the zero-tool-call recall assertion was kept.

All twenty live scenarios then passed. They include saving a stated preference without a “remember” command, recall in a new thread without a read tool or redundant write, a second preference without overwriting the first, and isolation from another customer's memory. Exchange checks verify that remembered preferences do not replace verified purchase facts or the customer's current request. Temporary conversation details and order facts stayed out of the preference record. Responses and persisted preference snapshots are retained in `data/chapter1/03f8aa9f-62b4-4005-ac06-1e9ab62320b3/`. This verifies the agent API path; the revised lesson has not been manually rehearsed in Studio.


## Studio working-memory panel

Verified the running Studio UI in thread `8ccd1ce4-e5dc-4f15-9470-a9d187275154`. The path is Threads → Memory → Working Memory. After a neutral greeting and a reload, the panel showed an empty preferences object. Submitting “My preferred shoe size is 9.” and reopening the panel showed `shoe_size: "9"`. The Edit Working Memory control opens an editor with Save Changes and Cancel. No manual memory edits were saved during verification.

The stored thread resource ID is `retail-agent`, not the terminal caller's `customer-alex`. Recording/reset directions now account for this difference. A new unsent thread can show the schema with “Send a message to the agent to enable working memory,” so the before view uses an existing thread with a completed message. The test thread and its saved preference remain visible for inspection.


## Shorter memory instructions

Replaced the memory-specific paragraphs with three general sentences covering what to retain, when to update, and the priority of the current request. Removed sample questions and exchange-specific memory rules. Storage-format guidance now lives in the schema description.

Early rehearsals exposed inconsistent category formatting and redundant writes on recall. The final concise instruction names `updateWorkingMemory` and restricts it to new or changed customer preferences. Existing assertions were retained. All twenty live scenarios passed in `data/chapter1/1268f887-41d1-4b03-9ea0-db318d902469/`; TypeScript, three offline tests, and the credential scan also passed during this change.


## Order lookup guidance in the tool description

Moved the rule to verify order details before answering purchase questions into `getOrderTool.description`. Removed the duplicate directive from agent instructions while keeping missing-order-ID and unavailable-lookup guidance. The storyboard now explains the tool description's role in selection without claiming that the model must discover registered tools by extra exploration.

TypeScript, all three offline tests, and the credential scan passed. Both live runs passed the order lookup and access checks. The first stopped on the known intermittent redundant working-memory write during recall. The unchanged second run passed all twenty scenarios, recorded in `data/chapter1/0a14fcff-faac-44e6-a306-7335a54fd8e3/`. No assertions were changed. The successful rerun does not resolve the intermittent memory-update behavior.


## Default working memory without custom selection rules

Removed the agent's memory-specific instructions and preferences-only schema at Angie's request. Mastra now provides its default Markdown working memory, with resource scope. Existing data is preserved; the reset helper clears the selected resource's record without deleting threads or orders.

The lesson now inspects what the agent chooses to save rather than promising that purchases and temporary details are excluded. The conversation-history comparison explicitly disables working memory, then enables it again for the persistence lesson. Independent live cases use separate resource IDs so one scenario's memories do not contaminate another; continuity cases deliberately share a resource.

Tests were updated for the changed requirements before running the new rehearsal. They no longer require a preferences-only JSON shape, forbid working-memory updates during recall, or prescribe the model's response to an unspecified larger-size request based on a remembered preference. They still verify actual persistence, fresh-thread recall, customer isolation, order ownership, verified lookups, and respect for an explicitly requested replacement. The offline integration test verifies Markdown writes across threads, reset isolation, and persistence after reopening storage.

TypeScript, the credential scan, and all three offline tests passed. All twenty live scenarios passed in `data/chapter1/f7d35a5d-a75c-4d56-803f-fa4cec0b2be9/`. The agent saved size 9 in the default record's Facts field and recalled it in a fresh thread. It sometimes updated memory during recall. Those choices are retained in the evidence and are not treated as failures under the revised lesson. Studio's panel location was verified previously; the new default-format flow was verified through the API, not a new manual Studio run.


## Preferences schema restored without memory instructions

Restored the preferences-only structured schema after Angie clarified that only the custom memory instructions should be removed. No custom memory instructions were reintroduced. The schema defines text values by preference category; the model still decides what constitutes a preference and when to update it. Reset and integration tests again use structured records and verify merging across updates.

TypeScript, the credential scan, all three offline tests, and all twenty live scenarios passed. Evidence is in `data/chapter1/74fd09be-a129-4058-8181-61361285c528/`. Recall may include a memory update; tests do not prohibit that behavior. The storyboard and walkthrough explain the schema without claiming it enforces the truth or source of a preference.


## Explicit preference storage restored

Disabled built-in working memory after a recording exposed order details carrying into new conversations. Restored custom readPreference and savePreference tools, with shopping categories and application-controlled customer identity. Instructions require a request to remember a preference; this is model behavior, not a deterministic consent check. An initial rehearsal saved a stated preference without a save request, so the instruction was clarified and the assertion retained.

All four offline tests, TypeScript, and the credential scan passed. All 25 live scenarios passed in `data/chapter1/62689a16-0d66-4285-9a33-2279ba15c189/evidence.json`. Regression cases cover old working-memory data being ignored, the opening request asking for an order number again in a new thread, replacement sizes not being persisted, and explicit saves surviving new conversations. Offline checks verify customer isolation, reset behavior, and compatibility with the old shoe-only table.

Current preferences use `customer_preferences` in store.db. The legacy table and Mastra working-memory records are preserved but unused. Existing chat messages remain available in their original threads. Reset custom preferences and start a new thread before another take. The script now demonstrates read/save results in traces instead of Studio's Working Memory panel. The agent has no maxSteps override; the rehearsal assertion now matches Mastra's five-step fallback.

## Chapter 2 preparation verification, October 14, 2026

Used the already cached Node 22.23.3 and npm 10.9.9 for these checks. No dependency installation or lockfile change was needed. The existing `.env.local` was preserved and no working store was reseeded.

Added isolated Chapter 2 inventory, policy, quote, approval, and exchange infrastructure, with a Jev HTTP wrapper and a terminal confirmation client. The default Chapter 1 configuration is preserved. The optional `RETAIL_MODE=order-lookup` selects its corrected unsupported-exchange instruction on the same agent. Native exchange tool registration, structured final agent responses, and the Mastra workflow remain lesson implementation work.

Passed type checking, all 16 offline tests, the expanded secret scan, the Chapter 2 starting-configuration check, and the deterministic five-step-limit test. The offline service rehearsal passed four checks with an explicitly labeled Jev test double; evidence is in `data/chapter2-rehearsal/run-koEzg0/evidence.json`. Both decline and confirm were exercised through the terminal interface with the offline fixture in `data/chapter2/52608a09-79d9-465a-840b-cda2ad26de9b/`. The prepared starting store in `data/chapter2/1fe24bd7-689f-49e1-b75d-2b17b8210208/` remains unused for exchanges.

All 29 Chapter 1 live rehearsal checks passed with their existing assertions. Evidence is in `data/chapter1/36ae140d-0b09-4959-991a-514be2389067/evidence.json`.

Live Jev verification reported `missing_key`; account access, the pinned model's live answers, and the proposed confidence threshold remain unverified. Studio confirmation and fresh Codespaces support are also unverified. See [Chapter 2 preparation](chapter-2-preparation.md) for the required setup and commands.


## Live Jev verification after key setup

The configured TypeSafe key successfully accessed `jev-1.13.0`. The first live run passed the fit and defect cases but classified "There is something wrong with my shoes" as a product problem instead of requesting clarification. Updated the classification criteria to require a concrete fault or ordered/received mismatch for the product-problem category. The original expected outcomes were retained.

The revised run passed all six live cases, including additional incorrect-item, color-preference, and unspecified-help examples. All responses passed schema validation and selected the intended code branch. Evidence is in `data/jev-verification/6570b121-d9d6-45ee-82e3-fac97e904d11/evidence.json`. No credentials were printed. The confidence threshold still needs broader evaluation; these examples establish integration behavior, not general classification accuracy.


## Conversational Studio and per-call structured output, October 16, 2026

Removed the default structured-output option from the agent. Studio uses text replies; `scripts/structured-response.ts` requests the schema for a separate call to the same agent. No dependency changes were needed.

Type checking, all 19 offline tests, the secret scan, and the agent configuration check passed. Live conversational and structured checks each passed clarification, cross-customer denial, defect review, proposal/decline, and proposal/confirmation. Each run used its own isolated databases. The structured checks still compare final IDs and quote fields with tool results. The standalone structured example also passed and created no completed exchange.

Live Studio checks showed conversational fit, decline, and defect replies. The fit proposal was declined; no exchange was confirmed in the user's running Studio. Earlier JSON-in-chat captures describe the previous configuration.

Evidence: conversational `data/exchange-workflow/e8746d50-a8bb-4643-8da4-a09f6f5ca564/chat-evidence.json`; structured `data/exchange-workflow/06b544e2-5691-417f-987b-654479e0b81b/chat-evidence.json`; standalone example `data/structured-response/95c734d7-de02-48fd-9b04-5c5a6a80fb8d/evidence.json`.


## Numbered chat confirmation, October 16, 2026

Studio confirmation now accepts `1` for confirm and `2` for decline. The parser maps the actual latest customer message to the workflow's internal decision; words or other text do not authorize an exchange. Agent instructions, tool descriptions, and the structured response schema use the numbered prompt.

All 19 offline tests, type checking, secret scanning, and configuration checks passed. Both conversational and structured live rehearsals passed seven turns, including `2` declining without an exchange and `1` committing one exchange. Evidence: `data/exchange-workflow/bfe8fb8b-29e5-4cb2-954c-6743d7e3e4c7/chat-evidence.json` and `data/exchange-workflow/954b8d56-d773-44ae-a32b-70f3ec9bf355/chat-evidence.json`. Earlier records using the words confirm and decline describe the previous chat interface.


## Recorded quality referrals, October 16, 2026

Product-problem requests now create or reuse a pending record in the quality department's `quality_reviews` queue before returning `human_review`. The workflow returns the saved referral ID; the agent apologizes and reports the referral without mentioning stock availability. The referral is saved locally; no external notification is sent.

Type checking, all 20 offline tests, and the secret scan passed. Offline tests cover saved referral contents, duplicate prevention, unchanged inventory and exchange records, and no referral for unauthorized or failed decisions. Both seven-turn live rehearsals passed, including database checks for the quality referral and numbered confirmation/decline. Evidence: `data/exchange-workflow/df8c7011-d9b1-44a1-895c-158ac8d1a8f3/chat-evidence.json` and `data/exchange-workflow/e770d1f7-f7ce-45e4-829b-c29aaac700a3/chat-evidence.json`.

Live Studio thread `35c0f951-cc72-42e1-a539-5b3d96f87b87` showed pending quality referral `b1c51088-d65a-4025-8024-3a5354eee5eb` and the reply: “I’m sorry the blue shoes arrived with the sole torn off. I’ve referred your exchange request for size 9 to our quality team for review.”
