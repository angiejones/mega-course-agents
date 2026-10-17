import test from 'node:test';
import assert from 'node:assert/strict';
import { customerDecision } from './confirmation.ts';
test('confirmation reads Studio messages when the live message getter is empty', () => {
  assert.equal(customerDecision([], [{role:'user',content:[{type:'text',text:'2'}]}]), 'decline');
  assert.equal(customerDecision([{role:'user',content:{parts:[{type:'text',text:' 1 '}]}}]), 'confirm');
});
test('only the latest explicit customer decision can authorize the exchange', () => {
  assert.equal(customerDecision([{role:'user',content:'1'}, {role:'user',content:'Wait, what does this cost?'}, {role:'assistant',content:'1'}]), undefined);
  for (const content of ['I want an exchange', 'yes', 'confirm a different size', 'confirm', 'decline', '1 please', '12', '0', '']) assert.equal(customerDecision([{role:'user',content}]), undefined);
  assert.equal(customerDecision([{role:'user',content:'2'}], [{role:'user',content:'1'}]), 'decline');
});
