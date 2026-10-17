import { referToQualityReview } from './quality-review.ts';
import type { DatabaseSync } from 'node:sqlite';
import { classifyIssue, issueBranch, decisionResponse, type Decision } from '../jev/client.ts';
import { checkEligibility, prepareExchange, type ExchangeInput, fixtureClock } from './store.ts';

export async function prepareExchangeFlow(db: DatabaseSync, customerId: string, input: ExchangeInput,
  message: string, decide: (message: string) => Promise<Decision> = classifyIssue, now = fixtureClock) {
  const eligibility = checkEligibility(db, customerId, input, now);
  if (!eligibility.eligible) return { status: 'rejected' as const, reason: eligibility.reason };
  const decision = decisionResponse.parse(await decide(message));
  const branch = issueBranch(decision.answers.issue);
  if (branch === 'human_review') return { status: branch, decision,
    referral: referToQualityReview(db, customerId, input, message, now) };
  if (branch === 'clarify') return { status: branch, decision };
  return { status: 'awaiting_confirmation' as const, decision,
    ...prepareExchange(db, customerId, input, undefined, now) };
}
