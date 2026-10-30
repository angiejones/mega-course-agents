import { recordJevCall } from './usage.ts';
import type { z } from 'zod';
import { validateMessage } from './input.ts';
import { choice, TypeSafeClient, type TypeSafeClientConfig } from '@typesafe-ai/sdk';
import { getJevConfig, rethrowJevError } from './setup.ts';
import { issueAnswer, validateDecision, type Decision } from './response.ts';

export { issueCategory, issueAnswer, decisionResponse, type Decision } from './response.ts';
export { JevError } from './setup.ts';

export async function classifyIssue(message: string, options: TypeSafeClientConfig = {}): Promise<Decision> {
  validateMessage(message);
  const jev = new TypeSafeClient(getJevConfig(options));
  const result = await recordJevCall(jev.defaultModel, () => jev.systemOne({
    state: { customerMessage: message },
    questions: {
      issue: choice('What kind of issue does the customer describe?', {
        fit_preference: 'A request about size, fit, color, style, or preference without a reported defect or incorrect item.',
        product_problem: 'A specific reported defect, damage, or incorrect item, such as a broken zipper or receiving a different product.',
        unclear: 'Not enough detail to identify a fit or preference issue, defect, or incorrect item. Includes vague problems, general requests for help, and unrelated messages.',
      }),
    },
  })).catch(rethrowJevError);
  return validateDecision(result, jev.defaultModel);
}

export function issueBranch(answer: z.infer<typeof issueAnswer>) {
  const validatedAnswer = issueAnswer.parse(answer);
  if (validatedAnswer.confidence < 0.8 || validatedAnswer.choice === 'unclear') return 'clarify' as const;
  return validatedAnswer.choice === 'fit_preference' ? 'standard_exchange' as const : 'human_review' as const;
}
