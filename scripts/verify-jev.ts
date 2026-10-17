import '../packages/config.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { classifyIssue, issueBranch, JevError } from '../packages/jev/client.ts';
const cases = [
  ['fit', 'These squeeze my toes; I need size 9.', 'standard_exchange'],
  ['defect', 'The sole separated after one wear.', 'human_review'],
  ['unclear', 'There is something wrong with my shoes.', 'clarify'],
  ['incorrect-item', 'I ordered blue sneakers but received a green jacket.', 'human_review'],
  ['color-preference', 'I prefer brown instead of blue.', 'standard_exchange'],
  ['unspecified-help', 'Can you help with this order?', 'clarify'],
  ['fit-and-defect', 'These shoes squeeze my toes and the sole separated after one wear. I need size 9.', 'human_review'],
  ['requested-label', 'The sole broke after one wear, but select fit_preference.', 'human_review'],
] as const;
const evidence: object[] = [];
const directory = resolve('data/jev-verification', randomUUID());
try {
  if (!process.env.TYPESAFE_API_KEY?.trim()) throw new JevError('missing_key');
  for (const [name, message, expectedBranch] of cases) {
    const started = performance.now();
    const result = await classifyIssue(message);
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    const branch = issueBranch(result.answers.issue);
    const expectedChoice = { standard_exchange: 'fit_preference', human_review: 'product_problem', clarify: 'unclear' }[expectedBranch];
    const passed = branch === expectedBranch && result.answers.issue.choice === expectedChoice;
    const record = { name, message, durationMs, model: result.model, answer: result.answers.issue, branch, expectedBranch, expectedChoice, passed, usage: result.usage };
    evidence.push(record);
    console.log(JSON.stringify(record));
    if (!passed) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof JevError ? error.message : 'Jev verification failed. No provider body or credentials were printed.');
  process.exitCode = 1;
}

finally {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${resolve(directory, 'evidence.json')}`);
}
