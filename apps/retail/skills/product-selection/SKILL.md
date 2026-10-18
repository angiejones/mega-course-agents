---
name: product-selection
description: Help a customer compare shopping combinations of a rain jacket and backpack by jacket size, availability and total budget. Use for shopping recommendations, not exchanges of purchased items.
---

# Compare shopping combinations

1. Ask for jacket size and total budget if either is missing. Preserve any other stated constraints.
2. Use execute_typescript with the discovered MCP shopping functions. Search each category, then read variants for the returned product IDs.
3. Keep jackets in the requested size and in-stock items in both categories. Pair jackets with backpacks and compare their combined price against the budget in integer cents. Under means strictly less; at most includes the boundary.
4. For cheapest options, sort by total price, then jacket SKU and backpack SKU. Return up to three distinct objects containing only jacketSku and backpackSku. Do not include names, prices or totals in the returned objects; the host adds those from the retrieved product data. An item may appear in more than one pair. Return [] if nothing fits; do not relax the constraints silently.
5. Present the checked product details and totals returned by the tool. If nothing fits, ask which constraint the customer would like to change.

These are shopping suggestions. They do not reserve stock or create an exchange. For an existing purchase, use the exchange tools and confirmation workflow.
