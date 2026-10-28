import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerTurn} from './customer-message.ts';
import {customerDecision} from '../exchanges/confirmation.ts';

test('Proposal and confirmation identify customer turns when current messages contain only assistant steps', () => {
  const proposal = {id:'proposal-question',role:'user',content:'What would I owe?'};
  const confirmation = {id:'confirmation-answer',role:'user',content:'1'};
  const steps = [{role:'assistant',content:'Calling a tool'}];
  assert.equal(customerTurn(steps,[proposal]),customerTurn([proposal]));
  assert.equal(customerTurn([], [proposal]),customerTurn([proposal]));
  assert.notEqual(customerTurn(steps,[proposal,confirmation]),customerTurn(steps,[proposal]));
  assert.equal(customerDecision(steps,[proposal,confirmation]),'confirm');
  assert.equal(customerTurn([confirmation],[proposal]),customerTurn([confirmation]));
  assert.notEqual(customerTurn([confirmation]),customerTurn([{...confirmation,id:'another-turn'}]));
  assert.throws(()=>customerTurn(steps,steps),/customer turn is required/);
});
