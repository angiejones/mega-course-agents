import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { unsupportedExchangeInstruction } from '../evals/exchange-policy.ts';
import cases from '../evals/chapter1-cases.json' with { type: 'json' };
// Each rehearsal gets isolated business data and conversation/trace storage.
const run = randomUUID();
const directory = resolve('data/chapter1', run);
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { customerServiceConfig } = await import('../apps/retail/src/mastra/agent.ts');
const originalConfiguration = { ...customerServiceConfig };
const { openStore, seed } = await import('../packages/store/index.ts');
const { settings } = await import('../packages/config.ts');
const db = openStore(); seed(db);
const evidence: object[] = [];
const memoryStore = await mastra.getStorage()?.getStore('memory');
assert.ok(memoryStore);
const { readPreference } = await import('../packages/store/preferences.ts');
function preferences() {
  return db.prepare('SELECT category, value FROM customer_preferences WHERE customer_id = ?')
    .all(settings.customerId);
}
function assertPreferenceSaved(result: any) {
  assert.ok(result.toolResults.some((tool: any) =>
    tool.payload?.toolName === 'savePreference' &&
    tool.payload?.result?.saved === true),
  'Expected a successful explicit preference save');
}
async function ask(
  label: string,
  prompt: string,
  thread = randomUUID(),
  // Thread history uses Mastra resource IDs; preference tools use settings.customerId.
  resource: string = randomUUID(),
) {
  const result = await mastra.getAgent('retailAgent').generate(prompt, {
    memory: {
      resource,
      thread,
    },
  });
  assert.ok(result.steps.length <= 5, 'Run must respect the five-step default');
  await mastra.observability.flush();
  const store = await mastra.getStorage()?.getStore('observability');
  assert.ok(result.traceId && await store?.getTrace({ traceId: result.traceId }), 'Trace must be persisted');
  evidence.push({ label, prompt, agent: 'retailAgent', configuration: { ...customerServiceConfig, workingMemory: false }, thread, answer: result.text, steps: result.steps.length, finishReason: result.finishReason, traceId: result.traceId, toolResults: result.toolResults, resource, preferences: preferences(), usage: { inputTokens: result.totalUsage.inputTokens, outputTokens: result.totalUsage.outputTokens } });
  // Write incrementally so failed rehearsals retain diagnostic evidence too.
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`${label}: ${result.steps.length} step(s), trace saved`);
  return result;
}
function requestFor(id: string) {
  const testCase = cases.find(item => item.id === id);
  assert.ok(testCase, `Missing case: ${id}`);
  return testCase.request;
}

function assertNoSizeQuestion(answer: string) {
  assert.doesNotMatch(
    answer,
    /(?:what|which)\s+(?:(?:replacement|shoe|new|preferred)\s+)*size\b|\bsize\b[^.!?]*\?/i,
    'The customer has already specified the replacement size',
  );
}

function assertFocusedItemQuestion(answer: string) {
  assert.match(answer.trim(), /\?$/, 'Item clarification must stop at the question');
  assert.equal((answer.match(/\?/g) ?? []).length, 1,
    'Ask one item-selection question at a time');
  assert.doesNotMatch(answer,
    /once you|after you|then I|I (?:can|will|could) ask|eligib|approv|can.t|cannot|unable|replacement size/i,
    'Item clarification must not preview later questions or append capability disclaimers');
}

async function checkExchange(id: string, orderId = 'order-1001') {
  const result = await ask(id, requestFor(id));
  assert.ok(result.toolResults.some(tool => {
    const payload = (tool as any).payload;
    return payload?.toolName === 'getOrder' &&
      payload.args?.orderId === orderId &&
      payload.result?.found === true;
  }), 'Exchange response must use a verified order lookup');
  assert.doesNotMatch(
    result.text,
    /\b(?:I|we)(?:'ve| have) (?:approved|completed|processed|created)\b/i,
    'The agent cannot perform exchanges',
  );
  return result;
}

try {
  // Old automatic memory must not influence a new conversation after migration.
  await memoryStore.updateResource({
    resourceId: settings.customerId,
    workingMemory: JSON.stringify({ preferences: {
      order_id: 'order-1001', shoe_size: '9',
    } }),
  });
  const recordingThread = randomUUID();
  const first = await ask('recording-missing-order',
    'Can I exchange my shoes for a larger size?', recordingThread, settings.customerId);
  assert.match(first.text, /order (?:ID|number)/i);
  assert.ok(first.toolResults.every(tool => (tool as any).payload?.toolName !== 'getOrder'));
  const orderReply = await ask('recording-order-reply', 'order-1001', recordingThread, settings.customerId);
  assert.match(JSON.stringify(orderReply.toolResults), /shoe-blue-8/);
  await ask('recording-replacement-size', 'Size 9, please.', recordingThread, settings.customerId);
  assert.deepEqual(preferences(), [], 'Order and replacement details must not become saved preferences');
  const repeat = await ask('recording-new-thread',
    'Can I exchange my shoes for a larger size?', randomUUID(), settings.customerId);
  assert.match(repeat.text, /order (?:ID|number)/i);
  assert.ok(repeat.toolResults.every(tool => (tool as any).payload?.toolName !== 'getOrder'));
  const unsaved = await ask('unsaved-size-in-new-thread',
    'What is my preferred shoe size?', randomUUID(), settings.customerId);
  assert.ok(unsaved.toolResults.some(tool => (tool as any).payload?.toolName === 'readPreference'));
  assert.doesNotMatch(unsaved.text, /\b9\b/);
  assert.deepEqual(preferences(), []);
  const statedOnly = await ask('preference-without-save-request',
    'My preferred shoe size is 9.', randomUUID(), settings.customerId);
  assert.ok(statedOnly.toolResults.every(tool => (tool as any).payload?.toolName !== 'savePreference'));
  assert.deepEqual(preferences(), [], 'Stating a preference is not a request to persist it');
  const owned = await ask('owned-order', 'Can I exchange the shoes in order-1001 for a larger size?');
  assert.match(JSON.stringify(owned.toolResults), /shoe-blue-8/);
  assert.match(owned.text, /size/i);
  const ambiguous = await ask('ambiguous-item', 'Can I exchange the shoes in order-1003 for a larger size?');
  assert.match(ambiguous.text, /blue/i); assert.match(ambiguous.text, /red/i);
  assert.match(JSON.stringify(ambiguous.toolResults), /shoe-blue-8/);
  assert.match(JSON.stringify(ambiguous.toolResults), /shoe-red-8/);
  assertFocusedItemQuestion(ambiguous.text);
  const denied = await ask('another-customers-order', 'Look up order-1002. What did I buy?');
  assert.match(JSON.stringify(denied.toolResults), /"found":false/);
  assert.doesNotMatch(denied.text, /jacket|129/);
  const color = await checkExchange('color-exchange');
  assert.match(color.text, /brown/i);
  assert.match(color.text, /\b8\b/);
  assertNoSizeQuestion(color.text);

  const product = await checkExchange('product-exchange');
  assert.match(product.text, /black/i);
  assert.match(product.text, /jacket/i);
  assert.match(product.text, /medium/i);
  assertNoSizeQuestion(product.text);

  const specified = await checkExchange('specified-size-exchange');
  assert.match(specified.text, /\b9\b/);
  assertNoSizeQuestion(specified.text);

  const unspecified = await checkExchange('unspecified-exchange');
  assert.match(unspecified.text, /\?/);
  assert.match(unspecified.text, /instead|replacement|exchange (?:it|them|the shoes) for/i);
  assert.doesNotMatch(unspecified.text, /(?:what|which) (?:replacement )?size/i);

  const identified = await checkExchange('identified-item-exchange', 'order-1003');
  assert.match(identified.text, /brown/i);
  assert.match(identified.text, /\b8\b/);
  assertNoSizeQuestion(identified.text);
  assert.doesNotMatch(identified.text, /which (?:one|pair|item|shoe)[^.!?]*\?/i);

  customerServiceConfig.exchangeInstruction = unsupportedExchangeInstruction;
  for (const [label, prompt] of [
    ['unsupported-ambiguous-exchange', requestFor('unsupported-ambiguous-exchange')],
    ['unsupported-owned-exchange', requestFor('unsupported-owned-exchange')],
    ['unsupported-missing-order', requestFor('unsupported-missing-order')],
    ['unsupported-specified-size', requestFor('unsupported-specified-size')],
  ]) {
    const response = await ask(label!, prompt!);
    assert.match(response.text, /(?:can.t|cannot|unable|not able|don.t|do not)[\s\S]*(?:exchang|process)/i,
      'Explain that exchanges cannot be processed');
    assert.doesNotMatch(response.text, /\?|(?:please|could you|can you) (?:provide|share|tell|send|choose|specify)|(?:what|which) (?:size|pair|item|order)/i,
      'Do not collect details for an unsupported exchange');
    assert.doesNotMatch(response.text, /(?:I|we)(?:’ve|'ve| have) (?:approved|completed|processed|created)/i);
    assert.equal(response.toolResults.length, 0, 'Declining an exchange needs no tool calls');
  }
  const supportedLookup = await ask('lookup-after-instruction-change', 'What did I buy in order-1001?');
  assert.match(JSON.stringify(supportedLookup.toolResults), /shoe-blue-8/);
  assert.match(supportedLookup.text, /blue/i);
  assert.match(supportedLookup.text, /\b8\b/);
  customerServiceConfig.orderLookup = false;
  const noTool = await ask('lookup-removed', 'What did I buy in order-1001?');
  assert.ok(noTool.toolResults.every(tool =>
    (tool as any).payload?.toolName !== 'getOrder'));
  assert.match(noTool.text, /(?:can.t|cannot|unable|no access)/i);
  assert.doesNotMatch(noTool.text, /blue|7900/);
  customerServiceConfig.orderLookup = true;
  const thread = randomUUID();
  await ask('thread-context', 'Call my shopping trip Coral Comet.', thread, settings.customerId);
  const followup = await ask('same-thread', 'What did I call my shopping trip?', thread, settings.customerId);
  assert.match(followup.text, /Coral Comet/i);
  const fresh = await ask('new-thread', 'What did I call my shopping trip?', randomUUID(), settings.customerId);
  assert.doesNotMatch(fresh.text, /Coral Comet/i);
  const saved = await ask('stated-preference', 'Please remember my preferred shoe size is 9.', randomUUID(), settings.customerId);
  assertPreferenceSaved(saved);
  assert.equal(readPreference(db, settings.customerId, 'shoe_size').value, '9');
  const preference = await ask('preference-in-new-thread',
    'What is my preferred shoe size?', randomUUID(), settings.customerId);
  assert.match(preference.text, /\b9\b/);
  assert.ok(preference.toolResults.some(tool => (tool as any).payload?.toolName === 'readPreference'));
  assert.ok(preference.toolResults.every(tool => (tool as any).payload?.toolName !== 'savePreference'));
  assert.equal(readPreference(db, settings.customerId, 'shoe_size').value, '9');
  const savedShirt = await ask('stated-shirt-preference',
    'Please remember my preferred shirt size is medium.', randomUUID(), settings.customerId);
  assertPreferenceSaved(savedShirt);
  assert.equal(readPreference(db, settings.customerId, 'shoe_size').value, '9');
  assert.equal(readPreference(db, settings.customerId, 'shirt_size').value, 'medium');
  const shirt = await ask('shirt-preference-in-new-thread',
    'What is my preferred shirt size?', randomUUID(), settings.customerId);
  assert.match(shirt.text, /medium/i);
  assert.equal(readPreference(db, settings.customerId, 'shirt_size').value, 'medium');
  const freshLookup = await ask('lookup-missing-order-with-preference',
    'What did I buy in my order?', randomUUID(), settings.customerId);
  assert.match(freshLookup.text, /order (?:ID|number)/i);
  assert.ok(freshLookup.toolResults.every(tool => (tool as any).payload?.toolName !== 'getOrder'));
  const orderWithPreference = await ask('order-facts-with-saved-preference',
    'What did I buy in order-1001?', randomUUID(), settings.customerId);
  assert.match(JSON.stringify(orderWithPreference.toolResults), /shoe-blue-8/);
  assert.match(orderWithPreference.text, /\b8\b/);

  assert.equal(readPreference(db, settings.customerId, 'shoe_size').value, '9');
  assert.equal(readPreference(db, settings.customerId, 'shirt_size').value, 'medium');

  console.log(`Chapter 1 evidence passed. Saved in ${directory}`);
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Chapter 1 rehearsal failed; sensitive provider error details suppressed.');
  process.exitCode = 1;
} finally { Object.assign(customerServiceConfig, originalConfiguration); db.close(); await mastra.observability.flush(); }
