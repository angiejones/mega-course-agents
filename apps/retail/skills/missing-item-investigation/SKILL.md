---
name: missing-item-investigation
description: Use to investigate a missing item from a delivery, an incomplete order, or a request to resend something that never arrived. Use even when the customer says the order was delivered or asks for a replacement.
---

# Investigate a missing item

1. Ask for the order ID if missing. Verify the purchase with orders_getOrder. Identify the missing item's SKU from that order; ask which item if ambiguous. Stop if the order cannot be verified.

2. Call orders_getShipments and match that SKU to its shipment. Do not use another item's tracking as evidence about the missing item. If multiple shipments contain the same SKU, ask which quantity is missing before choosing one. If no shipment record covers the item, stop and explain that fulfillment needs investigation; do not invent tracking.

3. Branch on the matched shipment. Do not read the missing-delivery reference preemptively: wait until orders_getTracking has returned delivered for the matched item.

   - No tracking ID: check orders_getSupportCases for that item. Include its caseId and recorded nextAction in your answer if one exists; otherwise explain that a fulfillment inquiry is needed. Do not call carrier tracking without an ID.

   - Tracking ID present: call orders_getTracking for that ID. If it is in transit, explain the separate shipment and the carrier's estimate, if supplied, then stop. Do not open a missing-delivery investigation for an item still in transit.
   
   - Carrier says delivered but the customer reports it missing: read [the missing-delivery procedure](references/missing-delivery.md), then check orders_getSupportCases and follow that procedure.

4. Explain what was verified, what it means for this item, and the next step. For an existing case, include its caseId and recorded nextAction in the answer so the customer can continue that case. Do not make them restart the investigation. None of these tools creates a case or sends a replacement; do not claim either action occurred.

Do not call exchange tools for an item the customer has not received. A request to send another item does not establish that the original shipment is lost. Do not repeatedly poll unchanged tracking within the same conversation.
