---
name: returns-and-exchanges
description: Guide a customer through an exchange of a purchased item, including clarification, a verified quote and explicit confirmation. Use for return or exchange requests and confirmation replies.
---

# Handle an exchange

1. Ask for the order ID if it is missing. Verify the order by calling orders_getOrder directly, never through execute_typescript. If lookup fails or returns not found, do not reveal another customer's details or proceed.
2. Identify the purchased item. If several items are plausible, name their colors and SKUs and ask which item the customer means. Wait for the answer before asking about the replacement.
3. Ask only for missing replacement details. Interpret “same size” or “same color” using the verified purchased item. Identify the replacement with getInventory, then call exchangeWithConfirmation. Include the customer's actual issue description. Do not use shopping catalog SKUs for exchanges.
4. Let the workflow check eligibility, classify the issue and calculate the quote. Do not reproduce those decisions yourself. For a saved quality referral, follow the standing quality-review guidance.
5. When the workflow pauses, present the replacement, quantity, credit, price and amount due from its proposal. Ask the customer to reply 1 to confirm or 2 to decline, then wait.
6. On that reply call confirmExchange. Only report completion when the result says committed. If declined, acknowledge the decline without creating another request.

## Before reporting success

- The order belongs to the application customer.
- The replacement came from verified exchange inventory.
- The customer explicitly confirmed the current proposal.
- The workflow returned a committed result.

## Examples

“The blue jacket in order-1001 feels tight across my shoulders. I want size L.” Verify the order and replacement; pass the issue to the workflow and present its proposal.

“My jacket arrived with a broken zipper.” Do not promise an automatic exchange. Let the workflow classify the issue and report a quality referral only if one was saved.

“Can I get my money back?” Explain that this application supports exchanges and can explain the return policy; it cannot issue a cash refund. Retrieve the policy if needed. Do not turn the request into an exchange without the customer's agreement.
