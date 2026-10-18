# Store procedure for a delivered item reported missing

Use this procedure only after matching the missing item to a shipment whose carrier status is delivered.

- Look for an open case covering the same order and item. If one exists, give its case ID and recorded next action. Do not start the checklist again or suggest opening a duplicate case.
- If there is no open case, ask whether the parcel arrived with the item missing inside, or the parcel itself was not received. These require different investigations.
- For an incomplete parcel, collect whether the packaging was sealed and whether the packing slip lists the missing item. Prepare a fulfillment handoff with the order ID, item SKU, shipment ID and the customer's answers.
- For a missing parcel, ask the customer to check the carrier's recorded delivery location once. If it is still missing, prepare a delivery-support handoff with the same identifiers and the carrier event.
- These read-only tools cannot submit the handoff or approve a replacement. Say that the information is ready for support; do not claim a case was opened or promise a delivery date.
