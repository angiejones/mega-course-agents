import assert from "node:assert/strict";
import test from "node:test";
import { preferenceInput } from "./product-assessment.ts";

test("Subagent context excludes logistics and preserves customer flexibility", () => {
  const preferences =
    "I'd prefer formal black shoes with cushioning, " +
    "but I'm open to something similar.";
  const input = preferenceInput(
    {
      sku: "test-loafer",
      name: "Brown leather loafer",
      features: ["Slip-on design", "Flexible sole"],
      size: "9",
      priceCents: 9900,
      currency: "USD",
      arrival: "2026-10-29T12:00:00Z",
      uncertainty: "Estimated arrival",
      quoteId: "private-quote",
      expiresAt: "2026-10-28T12:00:00Z",
    },
    {
      size: "9",
      maxPriceCents: 9900,
      deadline: "2026-10-30T21:00:00Z",
      preferences,
    },
  );
  assert.deepEqual(input, {
    product: {
      name: "Brown leather loafer",
      features: ["Slip-on design", "Flexible sole"],
    },
    preferences,
  });
});
