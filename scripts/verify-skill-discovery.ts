import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Workspace, LocalSkillSource } from '@mastra/core/workspace';
const directory = resolve('data/skill-discovery', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const agent = mastra.getAgent('retailAgent');
// Enable the production skill source in this isolated process, without changing recording settings.
const originalWorkspace = await agent.getWorkspace();
agent.__setWorkspace(new Workspace({ filesystem: originalWorkspace?.filesystem,
  skillSource: new LocalSkillSource({ basePath: resolve('.') }), skills: [resolve('apps/retail/skills')] }));
const db = openExchangeStore(process.env.STORE_DB_PATH);
seedExchangeStore(db);
const evidence: object[] = [];
const fixture = JSON.parse(readFileSync('fixtures/catalog/selection-case.json', 'utf8'));
async function ask(prompt: string, thread: string) {
  const modelInputs: unknown[] = [];
  const result = await agent.generate(prompt, {
    memory: { resource: 'customer-alex', thread },
    inputProcessors: [{ id: 'capture-skill-input', processLLMRequest: ({ prompt }) => {
      modelInputs.push(JSON.parse(JSON.stringify(prompt)));
    } }],
  });
  evidence.push({ prompt, text: result.text, modelInputs, toolCalls: result.toolCalls, toolResults: result.toolResults, traceId: result.traceId });
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  assert.ok(result.steps.length <= 12);
  return { result, modelInputs };
}
try {
  assert.doesNotMatch(String(await agent.getInstructions()), /load the (returns-and-exchanges|product-selection) skill/);
  const thread = randomUUID();
  const { result, modelInputs } = await ask('The blue jacket I bought is too tight. Can I exchange it?', thread);
  const firstInput = JSON.stringify(modelInputs[0]);
  assert.match(firstInput, /available_skills/);
  assert.match(firstInput, /returns-and-exchanges/);
  assert.match(firstInput, /product-selection/);
  assert.match(firstInput, /When a user asks about a topic covered by an available skill, activate it immediately/);
  assert.doesNotMatch(firstInput, /For shopping recommendations, load the product-selection skill/);
  assert.doesNotMatch(firstInput, /If several items are plausible, name their colors and SKUs/, 'Full exchange procedure must not be preloaded');
  const calls = result.toolCalls;
  const skill = calls.find(call => call.payload.toolName === 'skill');
  assert.ok(skill && JSON.stringify(skill.payload).includes('returns-and-exchanges'), 'Load the matching exchange skill');
  assert.match(result.text, /order.{0,30}(ID|number)|(?:ID|number).{0,30}order/i, 'Ask for the missing order number');
  assert.ok(!calls.some(call => ['orders_getOrder', 'exchangeWithConfirmation'].includes(call.payload.toolName)), 'Do not guess an order or start an exchange');
  const order = await ask('The order number is order-1001.', thread);
  assert.ok(order.result.toolCalls.some(call => call.payload.toolName === 'orders_getOrder'), 'Verify the supplied order');
  assert.match(order.result.text, /(?:what|which).{0,70}size|size.{0,70}(?:want|prefer|like)/i, 'Ask for the missing replacement size');
  assert.ok(!order.result.toolCalls.some(call => call.payload.toolName === 'exchangeWithConfirmation'), 'Wait for replacement details');
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
  const replacement = await ask("I'd like the same jacket in size L.", thread);
  const exchangeCall = replacement.result.toolCalls.find(t => t.payload.toolName === 'exchangeWithConfirmation');
  assert.ok(exchangeCall, 'Start the workflow only after collecting the missing details');
  assert.match(JSON.stringify(exchangeCall.payload), /tight/i, 'Preserve the original fit issue across turns');
  const proposal = replacement.result.toolResults.find(t => t.payload.toolName === 'exchangeWithConfirmation')?.payload.result as { status: string; requestId: string };
  assert.equal(proposal?.status, 'awaiting_confirmation');
  assert.ok(modelInputs.slice(1).some(input => JSON.stringify(input).includes('If several items are plausible, name their colors and SKUs')), 'Full procedure arrives after loading');
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
  console.log('Passed: exchange skill discovered and loaded, proposal prepared without commitment');
  const followup = await ask('2', thread);
  const declined = followup.result.toolResults.find(t => t.payload.toolName === 'confirmExchange')?.payload.result as { status: string; requestId: string };
  assert.equal(declined?.status, 'declined');
  assert.equal(declined.requestId, proposal.requestId);
  assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
  console.log('Passed: continuation declines the same saved proposal');
  const shopping = await ask(fixture.request, randomUUID());
  const selection = shopping.result.toolCalls.find(call => call.payload.toolName === 'skill');
  assert.ok(selection && JSON.stringify(selection.payload).includes('product-selection'), 'Load the matching shopping skill');
  const execution = shopping.result.toolResults.find(t => t.payload.toolName === 'execute_typescript')?.payload.result as { success: boolean; result: { jacket: { sku: string }; backpack: { sku: string }; totalCents: number }[] };
  assert.equal(execution?.success, true);
  assert.deepEqual(execution.result.map(p => [p.jacket.sku, p.backpack.sku]), fixture.expectedPairs);
  console.log('Passed: shopping skill selected and expected shortlist returned');
} finally {
  db.close(); await mastra.observability.flush(); await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
