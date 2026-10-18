import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startOrderMcpFixture } from './support/order-mcp-fixture.ts';
const close = await startOrderMcpFixture();
const { retailAgent, customerServiceConfig } = await import('../apps/retail/src/mastra/agent.ts');
try {

assert.equal(customerServiceConfig.orderLookup, true);
const tools = await retailAgent.listTools();
for (const name of ['orders_getOrder', 'readPreference', 'savePreference', 'getInventory', 'exchangeWithConfirmation', 'confirmExchange']) {
  assert.ok(tools[name], `Missing tool: ${name}`);
}
const options = await retailAgent.getDefaultOptions();
assert.equal(options.maxSteps, 12);
assert.equal(options.structuredOutput, undefined);
const instructions = await retailAgent.getInstructions();
assert.equal(typeof instructions, 'string');
const procedure = readFileSync('apps/retail/skills/returns-and-exchanges/SKILL.md', 'utf8');
assert.doesNotMatch(String(instructions), /load the (returns-and-exchanges|product-selection) skill/, 'Skill selection must use the discovered catalog rather than named routing instructions');
assert.match(procedure, /then call exchangeWithConfirmation/);
assert.match(procedure, /On that reply call confirmExchange/);
assert.match(String(instructions), /Customer identity comes from the application session/);
assert.doesNotMatch(String(instructions), /You cannot check eligibility/);
const memory = await retailAgent.getMemory();
assert.ok(memory);
assert.equal(memory.listTools().updateWorkingMemory, undefined);
console.log('Exchange agent configuration passed: order, preference, inventory and confirmation tools available; conversational replies and twelve-step limit active; automatic working memory disabled.');

} finally { await close(); }
