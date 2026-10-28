import type { Candidate, Requirements, Assessment } from "./contracts.ts";
import { assessProduct } from "./product-assessment.ts";
import type { ProductDecision } from "./product-decision.ts";

export type Evaluation = {
  assessment: Assessment;
  decision?: ProductDecision;
  tokens: number;
  usageComplete?: boolean;
};
export type Evaluate = (
  candidate: Candidate,
  requirements: Requirements,
) => Promise<Evaluation>;
export const evaluate: Evaluate = assessProduct;

export async function compare(
  candidates: Candidate[],
  requirements: Requirements,
  judge: Evaluate = evaluate,
) {
  const start = performance.now();
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return {
          sku: candidate.sku,
          ...(await judge(candidate, requirements)),
        };
      } catch {
        return {
          sku: candidate.sku,
          tokens: 0,
          usageComplete: false,
          error: "Assessment unavailable",
          assessment: undefined,
        };
      }
    }),
  );

  return {
    results,
    elapsedMs: Math.round(performance.now() - start),
    totalTokens: results.reduce((sum, r) => sum + r.tokens, 0),
    usageComplete: results.every((r) => !r.error && r.usageComplete !== false),
  };
}
