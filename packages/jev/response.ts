import { z } from 'zod';
import { JevError } from './setup.ts';

export const issueCategory = z.enum(['fit_preference', 'product_problem', 'unclear']);

const probability = z.number().min(0).max(1);

export const issueAnswer = z.object({
  type: z.literal('choice'), choice: issueCategory, confidence: probability,
  probabilities: z.object({ fit_preference: probability, product_problem: probability, unclear: probability }).strict(),
}).superRefine((answer, ctx) => {
  const values = Object.values(answer.probabilities);
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.001)
    ctx.addIssue({ code: 'custom', message: 'Probabilities must sum to one' });
  if (answer.probabilities[answer.choice] + 0.000001 < Math.max(...values))
    ctx.addIssue({ code: 'custom', message: 'Choice must have the highest probability' });
});

export function validateDecision(raw: unknown, expectedModel: string): Decision {
  const result = decisionResponse.safeParse(raw);
  if (!result.success || result.data.model !== expectedModel) throw new JevError('invalid_result');
  return result.data;
}

export const decisionResponse = z.object({
  model: z.string().min(1), answers: z.object({ issue: issueAnswer }),
  usage: z.object({ input_tokens: z.number().int().nonnegative().nullable(), output_tokens: z.number().int().nonnegative().nullable() }),
});

export type Decision = z.infer<typeof decisionResponse>;
