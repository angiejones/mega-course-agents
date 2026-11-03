import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('data/code-mode', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { customerServiceConfig } = await import('../apps/retail/src/mastra/agent.ts');
const { readTripProducts } = await import('../packages/catalog/trip-tools.ts');
const fixture = JSON.parse(readFileSync('fixtures/catalog/selection-case.json', 'utf8'));
const evidence: object[] = [];
try {
  assert.equal(customerServiceConfig.skills, false, 'Run this check with skills disabled');
  for (const [prompt, expected, totals] of [
    [fixture.request, fixture.expectedPairs, fixture.expectedTotals],
    ['Find three rain jacket and backpack combinations under $100 total, jacket size L, both in stock.', [], []],
  ] as [string, string[][], number[]][]) {
    const modelInputs: unknown[] = [];
    const result = await mastra.getAgent('retailAgent').generate(prompt + '\nFor this test, format your final answer as a JSON array of {jacketSku, backpackSku, totalCents} objects, or [] if nothing fits. This format applies only to the final answer.', {
      memory: { resource: 'customer-alex', thread: randomUUID() },
      inputProcessors: [{ id: 'capture-model-input', processLLMRequest: ({ prompt }) => {
        modelInputs.push(JSON.parse(JSON.stringify(prompt)));
      } }],
    });
    evidence.push({ prompt, text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults,
      modelInputs, traceId: result.traceId, steps: result.steps.length });
    writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
    const calls = result.toolCalls.map(call => call.payload.toolName);
    assert.ok(!calls.includes('skill'), 'No skill loading in this lesson');
    assert.ok(!calls.includes('getInventory'), 'Shopping must not use exchange inventory');
    const output = result.toolResults.filter(t => t.payload.toolName === 'execute_typescript').at(-1)?.payload.result as { success: boolean };
    assert.equal(output?.success, true);
    const answer = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    assert.deepEqual(answer.map((p: any) => [p.jacketSku, p.backpackSku]), expected);
    assert.deepEqual(answer.map((p: any) => p.totalCents), totals);
    const variants = new Map(readTripProducts().flatMap(p => p.variants).map(v => [v.sku, v]));
    for (const pair of answer) {
      const jacket = variants.get(pair.jacketSku), backpack = variants.get(pair.backpackSku);
      assert.ok(jacket && backpack);
      assert.equal(jacket.category,'rain-jacket');
      assert.equal(backpack.category,'backpack');
      assert.ok(jacket.size === 'L' && jacket.stock > 0 && backpack.stock > 0);
      assert.equal(pair.totalCents,jacket.priceCents + backpack.priceCents);
      assert.ok(pair.totalCents < (expected.length ? 15000 : 10000));
    }
    assert.ok(result.text.trim()); assert.ok(result.steps.length <= 12);
    const serialized = JSON.stringify(modelInputs);
    assert.ok(!serialized.includes('<available_skills>'));
    for (const row of readTripProducts().flatMap(p => p.variants)) {
      if (!expected.flat().includes(row.sku)) assert.ok(!serialized.includes(row.sku), `Unselected variant reached model: ${row.sku}`);
    }
    for (const sku of expected.flat()) assert.ok(serialized.includes(sku), 'Selected products reach the model');
    console.log(`Passed with skills disabled: ${prompt}`);
  }
} finally {
  await mastra.observability.flush(); await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
