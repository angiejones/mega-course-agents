# Chapter 3: Agentic capabilities

Continue with the same retail agent on `chapter3`. Use Node 22.23.3 and the locked dependencies. Keep your existing `.env.local`.

## Run the example

Start Studio in your own terminal with `npm run dev:exchanges`. This creates a new isolated store and preserves earlier stores. Open http://localhost:4111 and start a fresh chat for each example.

| Ask our agent | Inspect |
| --- | --- |
| Look up order-1001. | The discovered `orders_getOrder` tool calls the orders MCP server. |
| Look up order-1002. | The server refuses another customer's order. |
| What is your return policy? | `listMcpResources` discovers resources, then `readMcpResource` retrieves the policy by its URI. |
| How should I wash my Everyday jacket? Can I tumble dry it? | Workspace file tools discover and read the matching care document; inspect the source in the read-tool result. |
| My order says delivered, but the rain jacket wasn't in the box. Can you send another one? My order number is order-1004. | In Lesson 7, enable skills. Match the jacket to its own shipment and explain that it is in transit. Repeat in a new chat with order-1005 to inspect the delivered-but-missing branch and existing support case. |
| I need a rain jacket and a backpack for a weekend trip. Find the three cheapest combinations under $150 total, with the jacket in size L and both items in stock. | With skills disabled, generated code calls MCP searchProducts and getProductVariants, then returns three combinations totaling $88.00, $89.53 and $92.10 when the Lesson 4 large catalog is selected. |

## How the connections work

Standing domain instructions are defined directly in `apps/retail/src/mastra/agent.ts`, alongside the code-mode instructions. Use a fresh chat when comparing instruction changes so earlier conversation context does not affect the comparison.

Product-care files in `fixtures/product-care` are exposed through a contained, read-only `LocalFilesystem`. Mastra supplies listing, search and read tools. This collection is separate from the named policy and sizing resources served over MCP. The files contain care instructions for the listed products.

Skills use an explicit `LocalSkillSource`, so adding the product-care filesystem does not change their discovery source. Skills are discovered from `apps/retail/skills`. The model receives their metadata and can load a procedure with the `skill` tool. The missing-item investigation skill supplies the decision sequence. Its supporting reference is loaded only for a shipment marked delivered. The tools enforce customer ownership and only read records.

The orders MCP server exposes getOrder, getShipments, getTracking, getSupportCases, getInventory, exchangeWithConfirmation, searchProducts, getProductVariants, and two reference resources. Studio serves it at `http://localhost:4111/api/mcp/orders/mcp`. The agent's MCP client uses that endpoint by default; `ORDER_MCP_URL` can select another deployment. No direct lookup fallback is used if the server is unavailable. Local verification scripts use temporary loopback servers and isolated databases, closing them when each rehearsal finishes.

The customer identity comes from the server's application configuration. Authentication must be added before sharing the server with customers. Another client connecting to the endpoint uses that same configured customer; keep development ports private.

MCP resources do not become model context automatically. `listMcpResources` discovers resources across configured MCP servers. `readMcpResource` accepts a discovered server name and URI and asks the MCP client to read it. These tools contain no resource-specific names or URI mappings. The server derives the policy from the same stored policy used by eligibility checks. The size guide provides body chest measurements in centimetres for sizes S–XXL, measurement instructions, and fit guidance. It remains available on the server but is not part of the Lesson 2 recording.

Code mode exposes only the discovered MCP shopping tools to QuickJS. It cannot call retail mutation tools. Mastra supplies the execution tool and generated instructions. The standard QuickJS transport returns the program’s result without a shopping-specific schema; correctness is checked separately in tests. Shopping data is separate from exchange inventory.

## Verification

- `npm run check`: type checking, offline tests and secret scan.
- `npm run verify:capabilities`: MCP discovery, ownership and resource checks without model calls.
- `npm run verify:capabilities -- --live`: also test policy, sizing and order requests with captured model inputs.
- `npm run verify:product-care`: live matching and missing-document cases, source checks, model-input captures, read-only enforcement and containment.
- `npm run verify:code-mode`: live filtering and model-input checks.
- `npm run verify:exchange-chat`: live exchange regression, including decline and commitment.
- `npm run verify:mcp-exchange`: isolated MCP + existing workflow checks for confirm, decline, cancellation, invalid answers, stock changes and ownership.
- `npm run verify:step-limit`: deterministic twelve-step runtime check.

Live commands use the configured model and can incur API charges. Saved rehearsal evidence lives under `data/` and is ignored by Git.

## Exchange confirmation in Goose

Add a Streamable HTTP extension using `http://localhost:4111/api/mcp/orders/mcp`. Disable the old return-method extension. The same server now exposes order lookup, replacement inventory, and exchange confirmation.

Use a fresh store (`npm run dev:exchanges` in your terminal after stopping the current server) and a fresh Goose conversation. Ask: "The blue jacket in order-1001 is too tight across my shoulders. I'd like to exchange it for the same jacket in size L."

Goose should look up the order and replacement inventory, then call exchangeWithConfirmation. The server starts the Chapter 2 workflow. Its saved proposal becomes an elicitation form showing the original and replacement SKUs, quantity, credit, replacement cost, fee, and amount due. Select **decline** and submit first: expect status declined and no exchange. Start a fresh chat, repeat the request, select **confirm**, and submit: expect status committed and a receipt. This consumes the purchased quantity; use a new isolated store before repeating the successful exchange or recording Lesson 7.

Submitting the form is distinct from confirming: the submitted decision must be confirm. The MCP adapter resumes the same saved workflow run. It does not replace the workflow's ownership, eligibility, stock, quote, or duplicate checks. Closing/cancelling the form or declining the elicitation itself is handled by Mastra as a tool error; the workflow remains suspended and no exchange is created. Selecting decline inside the form resumes the workflow and records a declined proposal.

The result explicitly identifies the customer's form response. Protocol checks use scripted answers and live Jev classification; the full exchange interaction still needs a fresh Goose rehearsal. The earlier return-method form worked in Goose, but is no longer registered.

The skill lesson briefly discusses Skills over MCP as a distribution option. This implementation does not implement that extension. A receiving client would need extension support and the capabilities required by the skill.

## Recording skills in lesson order

`customerServiceConfig.skills` in `apps/retail/src/mastra/agent.ts` defaults to `false` for Lessons 1–6. Skills and instructions to load them are omitted from the agent. Before Lesson 7, set it to `true`, let Studio reload, and start a fresh chat. Code mode in Lesson 4 does not need skills; keep them disabled when running verify:code-mode. The skill rehearsal enables them in its isolated process. If Studio has not refreshed, restart it before recording.

The Studio agent discovers MCP tools and selects orders_getOrder for direct registration alongside its native tools. It retains its native inventory and chat-confirmation workflow tools; Goose uses the MCP versions. The MCP client supplies the server-prefixed name `orders_getOrder`, description, input schema, and execution function. There is no custom order-lookup wrapper or native fallback. Discovery happens in the async tools callback so the local MCP endpoint can start before it is contacted.

## Store exchange interface with MCP Apps

Stop the previous Studio process, then run `npm run dev:mcp-app`. This builds the store interface and starts Studio with a new isolated store and `RETAIL_MCP_APPS=true`. Reconnect Goose to the same orders endpoint. Earlier lessons use `npm run dev:exchanges`, which leaves the app tools disabled.

Ask: "The blue jacket in order-1001 is too tight across my shoulders. I'd like to exchange it for the same jacket in size L. Show me the store's exchange card so I can review it."

`previewExchange` starts the Chapter 2 workflow and returns the saved proposal. Its metadata points to `ui://retail/exchange.html`. A compatible host reads the bundled HTML resource and displays the store interface. `view.ts` receives the result and renders the product illustrations, sizes, and amounts. The response schema supplies data; the view is separate code.

Click Decline first. Repeat in a fresh chat and click Confirm exchange. The buttons call the app-only `decideExchange` tool through the host, and the server resumes the saved workflow. The result updates the card and the model's context. The customer decision doesn't require another model-generated tool call. A committed exchange consumes the purchased quantity, so start a new store before repeating it.

Run `npm run verify:mcp-app` to check the MCP integration and exchange outcomes. Run `npm run build:mcp-app` after editing the view and restart Studio to load the new bundle.

The local server uses the configured customer, as in earlier lessons. App-only visibility is not authentication. Shared deployments need authenticated customer context and authorization, a stable `EXCHANGE_APP_SECRET` across instances, and persistent shared workflow storage. Without a configured secret, restarting invalidates outstanding card references. The HTML bundles its scripts and illustrations and requests no external network access.

See the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) and [quickstart](https://apps.extensions.modelcontextprotocol.io/api/documents/quickstart.html).

Skill discovery follows the [Agent Skills client implementation guide](https://agentskills.io/client-implementation/adding-skills-support). Mastra scans the configured source, injects a catalog of names and descriptions plus general activation guidance, and supplies the `skill` tool. The application does not maintain a separate instruction mapping each task to a named skill. Run `npm run verify:skill-discovery` to test discovery and loading with isolated databases without changing the recording skills setting.


## Lesson 4: shopping through MCP and code mode

The lesson order is MCP tools, resources, product-care files, code mode, elicitation, MCP Apps, then skills.

`packages/catalog/trip-tools.ts` supplies product search and variant lookup on the orders MCP server. `getShoppingCodeMode()` discovers the real tools through MCP and allows only those two inside QuickJS. Both the generated instructions and execute_typescript tool are registered with the agent. The shopping procedure does not depend on a skill.

For the shopping request, generated code filters variants, forms jacket/backpack pairs, calculates combined prices and selects the cheapest combinations. The customer supplies the size, budget and number of results. There is no custom SKU-pair return restriction or host-side price reconstruction. Mastra's standard transport returns the program's result and any logs. Tests check the selected items, totals and which product records reached the model. Successful execution alone does not prove the answer is correct.

For Lesson 4, stop Studio and run `SHOPPING_CATALOG_PATH=fixtures/catalog/large-trip-products.json npm run dev:exchanges`. Keep skills disabled and Max Steps at 12, then start a fresh chat. This selects 240 products and 720 variants, separate from exchange inventory. These tools read data; they do not reserve or purchase products. Return to ordinary `npm run dev:exchanges` for Lesson 5.

The default small fixture remains `fixtures/catalog/trip-products.json`. Its regression cases include an exactly-$150 pair excluded by an under-$150 request, and a $100 request with no eligible pairs. Those expected results apply to the small fixture only.

`npm run verify:code-mode` tests both requests with skills disabled and captures model inputs. `npm test` exercises real MCP discovery and calls, price boundaries, stock filtering, general return values, sandbox restrictions, and execution timeout.


The [standard code-mode comparison](standard-code-mode-comparison.md) used 3 runs per approach. Direct tools averaged 51,537 total tokens and 20.54 seconds; code mode averaged 2,106 tokens and 5.64 seconds. Correct rankings were 1/3 and 3/3, respectively. Code mode had no retries. These measurements apply to this request and catalog. Run `npm run compare:code-mode -- --large` to repeat the comparison; an incorrect answer makes the comparison fail after saving the results.

## Lesson 7: missing-item investigation

The agent defaults to 12 model steps. Set Studio's Max Steps to 12 too; a client can override the application default. Keep skills disabled for Lessons 1 through 6, then enable them for Lesson 7 and start fresh chats.

The three new read-only tools expose shipment contents, tracking, and existing support cases. Their descriptions explain each operation. The investigation procedure lives in `apps/retail/skills/missing-item-investigation/SKILL.md`, not in the system instructions.

- `order-1004`: the backpack arrived, but the jacket is in transit. Explain the separate shipment and carrier estimate, then stop.
- `order-1005`: the jacket is marked delivered. Read the skill's missing-delivery reference, then find the existing case and give its ID and next action.
- `order-1006`: the jacket has no tracking yet. Check the fulfillment case without calling carrier tracking.

Run `npm run verify:missing-item` to compare the same three requests with and without skills. Both conditions use fresh threads, the same data, model, application instructions and 12-step allowance. The script records baseline deviations and asserts the skill-enabled procedure, including conditional reference loading and no exchange creation. A successful run is evidence for these cases, not a guarantee of future model behavior.


