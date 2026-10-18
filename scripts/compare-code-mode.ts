import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Agent } from '@mastra/core/agent';

if (process.argv.includes('--large')) process.env.SHOPPING_CATALOG_PATH = 'fixtures/catalog/large-trip-products.json';
const directory = resolve('data/code-mode-comparison', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { settings } = await import('../packages/config.ts');
const { orderClient } = await import('../packages/mcp/order-client.ts');
const { createShoppingCodeMode } = await import('../packages/catalog/code-mode.ts');
const { readTripProducts } = await import('../packages/catalog/trip-tools.ts');
const fixture = JSON.parse(readFileSync('fixtures/catalog/selection-case.json', 'utf8'));
const commonInstructions = [
  'You help customers find clothing-store products using the supplied shopping tools.',
  'For this comparison, your final message to the customer must be a JSON array of {jacketSku, backpackSku, totalCents} objects. This format applies only to the final message, not to values returned by tools or generated programs; follow each tool\'s own return contract. Return [] if no combination meets the request.',
].join('\n');
const products = readTripProducts();
const variants = products.flatMap(p => p.variants);
const expected = variants.filter(v => v.category === 'rain-jacket' && v.size === 'L' && v.stock > 0)
  .flatMap(j => variants.filter(v => v.category === 'backpack' && v.stock > 0)
    .map(b => ({ jacketSku: j.sku, backpackSku: b.sku, totalCents: j.priceCents + b.priceCents })))
  .filter(pair => pair.totalCents < 15000)
  .sort((a, b) => a.totalCents - b.totalCents || a.jacketSku.localeCompare(b.jacketSku) || a.backpackSku.localeCompare(b.backpackSku))
  .slice(0, 3);
assert.equal(expected.length, 3);
const selected = new Set(expected.flatMap(pair => [pair.jacketSku, pair.backpackSku]));
writeFileSync(resolve(directory, 'catalog.json'), JSON.stringify(products, null, 2));
const runs: any[] = [];
try {
  const discovered = await orderClient.listTools();
  const shopping = Object.fromEntries(Object.entries(discovered).filter(([name]) => ['orders_searchProducts', 'orders_getProductVariants'].includes(name)));
  assert.equal(Object.keys(shopping).length, 2);
  for (let repeat = 1; repeat <= 3; repeat++) {
    for (const strategy of repeat % 2 ? ['direct', 'code'] : ['code', 'direct']) {
      const mcpCalls: any[] = [];
      const tools = Object.fromEntries(Object.entries(shopping).map(([name, tool]) => [name, {
        ...tool,
        execute: async (...args: any[]) => {
          const result = await (tool.execute as any)(...args);
          mcpCalls.push({ name, input: args[0], result });
          return result;
        },
      }]));
      const mode = strategy === 'code' ? createShoppingCodeMode(tools as any) : undefined;
      const agent = new Agent({
        id: `comparison-${strategy}-${repeat}`, name: 'Shopping comparison', model: settings.smallModel,
        instructions: commonInstructions + (mode ? '\n' + mode.instructions : ''),
        tools: mode ? { execute_typescript: mode.tool } : tools as any,
        defaultOptions: { maxSteps: 12 },
      });
      const modelInputs: unknown[] = [];
      const started = Date.now();
      const result = await agent.generate(fixture.request, {
        inputProcessors: [{ id: 'capture-comparison', processLLMRequest: ({ prompt }) => {
          modelInputs.push(JSON.parse(JSON.stringify(prompt)));
        } }],
      });
      let answer: any;
      try { answer = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); } catch { answer = null; }
      const visibleVariantIds = variants.map(v => v.sku).filter(sku => JSON.stringify(modelInputs).includes(sku));
      const run = {
        repeat, strategy, catalogProducts: products.length, catalogVariants: variants.length, expected, model: settings.smallModel, maxSteps: 12, prompt: fixture.request,
        instructions: commonInstructions + (mode ? '\n' + mode.instructions : ''),
        text: result.text, answer, correct: isDeepStrictEqual(answer, expected),
        steps: result.steps.length, modelToolCalls: result.toolCalls.length, mcpCalls,
        totalUsage: result.totalUsage, elapsedMs: Date.now() - started,
        visibleVariantIds, unselectedVariantIds: visibleVariantIds.filter(sku => !selected.has(sku)),
        modelInputs, toolCalls: result.toolCalls, toolResults: result.toolResults,
      };
      runs.push(run);
      writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(runs, null, 2));
      console.log(JSON.stringify({ ...run, instructions: undefined, modelInputs: undefined, toolCalls: undefined, toolResults: undefined, mcpCalls: mcpCalls.length, visibleVariantIds: run.visibleVariantIds.length, unselectedVariantIds: run.unselectedVariantIds.length }));
    }
  }
  assert.ok(runs.every(run => run.correct), 'Both strategies must return the correct three combinations and totals');
  assert.ok(runs.filter(run => run.strategy === 'code').every(run => run.unselectedVariantIds.length === 0), 'Code mode must keep unselected variant IDs out of model inputs');
} finally {
  await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
