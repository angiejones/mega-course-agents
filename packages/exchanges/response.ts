import { z } from 'zod';

// A final response is a report of the outcome, never authority to change the store.
export const retailResponseSchema = z.object({
  status: z.enum(['information', 'clarify', 'awaiting_confirmation', 'human_review', 'rejected', 'declined', 'committed', 'error'])
    .describe('Use the latest workflow status for exchange requests. Use rejected for denied order access or failed eligibility. information is for successful ordinary lookup or preference replies; error means a capability failed.'),
  message: z.string().min(1).describe('The customer-facing answer or question. When awaiting confirmation, show the quote and ask for 1 to confirm or 2 to decline.'),
  requestId: z.string().nullable().describe('Copy the verified exchange request ID, or null when none is available.'),
  exchangeId: z.string().nullable().describe('Copy the committed receipt exchangeId only after success; otherwise null.'),
  quote: z.object({
    replacementSku: z.string(),
    quantity: z.number().int().positive(),
    currency: z.literal('USD'),
    creditCents: z.number().int().nonnegative(),
    replacementCents: z.number().int().nonnegative(),
    feeCents: z.number().int().nonnegative(),
    differenceCents: z.number().int(),
  }).nullable().describe('Copy amounts and replacement details from the verified proposal or receipt. Never calculate them yourself. Null when no quote is available.'),
});
export type RetailResponse = z.infer<typeof retailResponseSchema>;
