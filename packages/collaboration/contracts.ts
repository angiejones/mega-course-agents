import { z } from "zod";
export const requirementsSchema = z
  .object({
    size: z.string().min(1).max(20),
    deadline: z.iso.datetime(),
    maxPriceCents: z.number().int().nonnegative().max(100000),
    preferences: z.string().max(2000).describe(
      "Product preferences and intended use, including which preferences " +
      "are flexible or mandatory. Keep size, budget and deadline in their " +
      "separate fields; omit delivery-investigation history.",
    ),
  })
  .strict();
export const candidateSchema = z.object({
  sku: z.string(),
  name: z.string(),
  size: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  arrival: z.iso.datetime(),
  features: z.array(z.string()),
  uncertainty: z.string(),
  quoteId: z.string(),
  expiresAt: z.iso.datetime(),
});
export const assessmentSchema = z.object({
  suitable: z.boolean(),
  reasons: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  missingInformation: z.array(z.string()),
});
export const investigationSchema = z.object({
  outcome: z.enum(["recoverable", "too_late", "inconclusive"]),
  findings: z.array(z.string()),
  recoveryAt: z.iso.datetime().nullable(),
  reference: z.string(),
});
export type Requirements = z.infer<typeof requirementsSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type ServiceResult =
  | { state: "input-required"; question: string }
  | { state: "completed"; data: unknown };
