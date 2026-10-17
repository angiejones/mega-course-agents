import assert from 'node:assert/strict';
import { retailAgent, customerServiceConfig } from '../apps/retail/src/mastra/agent.ts';

assert.equal(customerServiceConfig.orderLookup, true);
const tools = await retailAgent.listTools();
for (const name of ['getOrder', 'readPreference', 'savePreference', 'getInventory', 'exchangeWithConfirmation', 'confirmExchange']) {
  assert.ok(tools[name], `Missing tool: ${name}`);
}
const options = await retailAgent.getDefaultOptions();
assert.equal(options.maxSteps, 5);
assert.equal(options.structuredOutput, undefined);
const instructions = await retailAgent.getInstructions();
assert.equal(typeof instructions, 'string');
assert.match(String(instructions), /then call exchangeWithConfirmation/);
assert.match(String(instructions), /On that reply call confirmExchange/);
assert.doesNotMatch(String(instructions), /You cannot check eligibility/);
const memory = await retailAgent.getMemory();
assert.ok(memory);
assert.equal(memory.listTools().updateWorkingMemory, undefined);
console.log('Exchange agent configuration passed: order, preference, inventory and confirmation tools available; conversational replies and five-step limit active; automatic working memory disabled.');
