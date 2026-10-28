# Supplier sourcing agent

Retail delegates a sourcing outcome with size, total budget, deadline, preferences and rejected products. The supplier agent chooses search terms, investigates products, checks allocation and delivery options, and adapts when a product or route cannot satisfy the request. It selects up to three validated offers and explains the tradeoffs.

Its private tools are `searchProducts`, `inspectAvailability`, `checkDeliveryOptions`, `requestQuote` and `submitOffers`. Code enforces stock, allocation, size, total price and arrival constraints for each requested quote. The agent chooses what to investigate; it cannot bypass those constraints. Retail receives the chosen quotes and a decision record, not the supplier's warehouse stock counts.

The remote warehouse oxford illustrates adaptation. Standard shipping takes 96 hours. Express takes 30 hours after dispatch and adds $15, giving a total of $94. A customer with a suitable deadline and $99 budget may have an option that a standard-shipping-only search would miss. These are fictional records, not actual delivery promises.

Run `npm run serve:supplier` with `SUPPLIER_TOKEN`. Operational records persist in `supplier-operations.db` in the selected store directory; A2A task history persists separately in `supplier-tasks.db` in the selected store directory. A completed search is a finished task. A revised request starts a new search with updated constraints and rejected products.

Quotes expire after fifteen minutes. Reservation validates the quote and stock again, writes transactionally, and reuses the receipt for the same request ID. A receipt confirms a local reservation, not payment, dispatch or guaranteed delivery.

The exported `source` function remains a deterministic fixture for existing comparison experiments and service tests. The live supplier agent uses the granular investigation tools instead.
