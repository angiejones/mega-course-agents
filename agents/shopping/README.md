# Personal shopping assistant

This Mastra agent owns the customer's conversation and preferences. The completed agent registers `contactRetailer` directly in `src/agent.ts`; its implementation is in `src/contact-retailer.ts`. It delegates order problems to the independent retail agent through A2A, relays questions and proposals, and waits for customer confirmation. Retail owns the order checks and resolution; the supplier owns sourcing.

For normal development, run `npm run dev:shopping` after starting the retail gateway and its dependencies. This opens a separate Studio app on port 4116, with its own build directory, conversation storage and traces. The existing retail Studio on port 4111 can keep running. Select **Personal shopping assistant** and use Chat. In Studio, inspect Agents > Personal shopping assistant > Chat, expandable ContactRetailer results, Config > Tools > contact-retailer > Overview, and Traces > run > tool: contactRetailer.

`contactRetailer` has no message or approval argument. It forwards the actual latest customer message, and stores the remote task and context IDs by customer and shopping thread. Repeated calls within one customer turn reuse the saved response. The model cannot turn a recommendation into a synthetic `1` confirmation. The retailer still enforces the separate-turn proposal check.

`SHOPPING_TOKEN` authenticates the connection. The gateway binds it to the configured customer. `RETAIL_GATEWAY_URL` selects the trusted retail endpoint. `SHOPPING_AGENT_DB_PATH` and `SHOPPING_DELEGATION_DB_PATH` isolate conversation storage and remote references. This local example is for one configured customer; production must derive identity from the authenticated user session.

The utility in `agents/shopping-client/client.ts` remains available for protocol diagnostics. It is not the shopping agent.
