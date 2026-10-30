import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardCandidates,replacePrivateStaffEmails,staffContactGuardrail,withGuardrailEvents,type GuardEvent} from '../../packages/guardrails/index.ts';
test('blocks digit-form test cards but accepts last four and order IDs',()=>{
 for(const text of ['4242424242424242','4242 4242 4242 4242','4242-4242-4242-4242'])assert.equal(cardCandidates(text).length,1);
 for(const text of ['order-1001','last four 4242','4242424242424241','0000000000000000'])assert.equal(cardCandidates(text).length,0);
});
test('replaces known private staff addresses and keeps other text intact',()=>{
 assert.equal(replacePrivateStaffEmails('Email jordan@personal.example or JORDAN@PERSONAL.EXAMPLE.'),'Email support@store.example or support@store.example.');
 assert.equal(replacePrivateStaffEmails('I prefer email updates for order-1001.'),'I prefer email updates for order-1001.');
});
test('output processor preserves tool results and non-assistant messages',async()=>{
 const events:GuardEvent[]=[];
 const messages:any[]=[{role:'user',content:{parts:[{type:'text',text:'jordan@personal.example'}]}},{role:'assistant',content:{content:'Contact jordan@personal.example',parts:[{type:'text',text:'Contact jordan@personal.example'},{type:'tool-invocation',toolInvocation:{result:'unchanged'}}]}}];
 const result:any=await withGuardrailEvents(events,()=>staffContactGuardrail.processOutputResult!({messages} as any));
 assert.equal(result[1].content.parts[0].text,'Contact support@store.example');
 assert.equal(result[1].content.content,'Contact support@store.example');
 assert.equal(messages[1].content.content,'Contact jordan@personal.example');
 assert.deepEqual(result[0],messages[0]);assert.deepEqual(result[1].content.parts[1],messages[1].content.parts[1]);
 assert.equal(messages[1].content.parts[0].text,'Contact jordan@personal.example');
 assert.equal(events[0].action,'replaced');
});

test('leaves official support and customer addresses unchanged',()=>{
 for(const text of ['Email support@store.example.', 'My email is alex@example.test.', 'Contact other@personal.example.', 'notjordan@personal.example', 'jordan@personal.example.evil']) {
  assert.equal(replacePrivateStaffEmails(text),text);
 }
});

test('replaces staff addresses inside Markdown bold and links',()=>{
 assert.equal(replacePrivateStaffEmails('Email **jordan@personal.example**.'),'Email **support@store.example**.');
 assert.equal(replacePrivateStaffEmails('[Jordan](mailto:jordan@personal.example)'),'[Jordan](mailto:support@store.example)');
});
