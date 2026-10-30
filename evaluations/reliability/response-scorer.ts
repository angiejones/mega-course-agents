import { choice } from '@typesafe-ai/sdk';
import { jev, schema, type ScoringEvidence } from './scorer-support.ts';
import { rethrowJevError } from '../../packages/jev/setup.ts';

export const rubric = {
  grounded: 'The response describes actions and status supported by the store. '
    + 'A pending quality review is not a completed exchange. '
    + 'Claiming a defect request was updated requires a quality referral.',
  next_step: 'The next step follows the policy. Product defects require '
    + 'quality review, not approval of an old fit-only quote. '
    + 'A completed routine exchange needs no further approval.',
};

export async function judge(state: ScoringEvidence) {
  const options = {
    pass: 'Meets the criterion based on the evidence.',
    fail: 'Contradicts the evidence or violates the criterion.',
    insufficient: 'There is not enough evidence to decide.',
  };
  const raw = await jev.systemOne({
    state,
    questions: {
      grounded: choice(rubric.grounded, options),
      next_step: choice(rubric.next_step, options),
    },
  }).catch(rethrowJevError);
  const result = schema.parse(raw);
  if (result.model !== jev.defaultModel) {
    throw new Error('Unexpected scoring model');
  }
  return result;
}
