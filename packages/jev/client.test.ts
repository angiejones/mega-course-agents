import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIssue, decisionResponse, issueBranch, JevError } from './client.ts';
const answer = { type: 'choice' as const, choice: 'fit_preference' as const, confidence: 0.9,
  probabilities: { fit_preference: 0.95, product_problem: 0.03, unclear: 0.02 } };
const response = { model: 'jev-1.13.0', answers: { issue: answer }, usage: { input_tokens: 20, output_tokens: 2 } };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
test('Jev sends a bounded choice question and code branches on its validated answer', async () => {
  const result = await classifyIssue('These squeeze my toes; I need size 9.', { apiKey: 'test-only', compression: false, fetch: async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.questions.issue.type, 'choice');
    assert.equal(body.state.customerMessage, 'These squeeze my toes; I need size 9.');
    return json(response);
  } });
  assert.equal(issueBranch(result.answers.issue), 'standard_exchange');
  assert.equal(issueBranch({ ...answer, confidence: 0.3 }), 'clarify');
  assert.equal(issueBranch({ ...answer, choice: 'product_problem', probabilities: { fit_preference: 0.01, product_problem: 0.98, unclear: 0.01 } }), 'human_review');
  assert.equal(issueBranch({ ...answer, choice: 'unclear', probabilities: { fit_preference: 0.01, product_problem: 0.01, unclear: 0.98 } }), 'clarify');
});
test('Jev rejects malformed answers and unexpected models without echoing response bodies', async () => {
  for (const issue of [{ ...answer, choice: 'invented' }, { ...answer, confidence: 1.2 }, { ...answer, probabilities: { fit_preference: 0.1, product_problem: 0.1, unclear: 0.1 } }, { ...answer, choice: 'unclear' }]) {
    assert.equal(decisionResponse.safeParse({ ...response, answers: { issue } }).success, false);
  }
  await assert.rejects(classifyIssue('test', { apiKey: 'test-only', compression: false, fetch: async () => json({ ...response, model: 'other' }) }), /invalid_result/);
  await assert.rejects(classifyIssue('test', { apiKey: 'test-only', compression: false, fetch: async () => new Response('sensitive body') }), error => error instanceof JevError && !error.message.includes('sensitive'));
});
test('Jev bounds retries and does not retry auth failures', async () => {
  let calls = 0;
  const result = await classifyIssue('test', { apiKey: 'test-only', retry: { backoffInitialMs: 0, backoffMaxMs: 0 }, fetch: async () => ++calls < 3 ? new Response('', { status: 429 }) : json(response) });
  assert.equal(result.model, 'jev-1.13.0'); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(classifyIssue('test', { apiKey: 'test-only', retry: { backoffInitialMs: 0, backoffMaxMs: 0 }, fetch: async () => { calls++; return new Response('private', { status: 401 }); } }), /HTTP 401/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(classifyIssue('test', { apiKey: 'test-only', retry: { backoffInitialMs: 0, backoffMaxMs: 0 }, fetch: async () => { calls++; throw new Error('private'); } }), /transport/);
  assert.equal(calls, 3);
  let missingKeyCalls = 0;
  await assert.rejects(classifyIssue('test', { apiKey: '', fetch: async () => { missingKeyCalls++; return json(response); } }), /missing_key/);
  assert.equal(missingKeyCalls, 0);
});

test('missing token counts do not prevent a valid Jev decision from reaching the workflow', async () => {
  const result = await classifyIssue('These squeeze my toes.', {
    apiKey: 'test-only',
    fetch: async () => json({ ...response, usage: { input_tokens: null, output_tokens: null } }),
  });
  assert.deepEqual(result.usage, { input_tokens: null, output_tokens: null });
  assert.equal(issueBranch(result.answers.issue), 'standard_exchange');
  assert.equal(decisionResponse.safeParse({ ...response, usage: { input_tokens: -1, output_tokens: null } }).success, false);
});
