import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, read, write } from './storage.ts';
import { SourcingInvestigation, reserve } from '../../agents/supplier/src/service.ts';
import { ShoppingDelegation } from '../../agents/shopping/src/delegation.ts';
import type { RemoteResult } from './client.ts';
import { ResolutionService, type Remote } from './resolution.ts';
import { openExchangeStore, seedExchangeStore } from '../exchanges/store.ts';
const requirements = { size:'9', maxPriceCents:9900, deadline:'2026-10-23T12:00:00Z', preferences:'Formal shoes with cushioning' };
const now = new Date('2026-10-20T12:00:00Z');
test('supplier can reject a standard route then validate an express alternative without relaxing budget or deadline', () => {
  const db=database(':memory:');
  try {
    const search=new SourcingInvestigation(db, requirements, now);
    search.search('leather oxford');
    search.inspect('formal-reserved-9');
    const allocated=search.quote('formal-reserved-9','standard');
    assert.equal(allocated.accepted,false);
    assert.match(JSON.stringify(allocated),/allocated/);
    search.inspect('formal-late-9');
    assert.equal(search.quote('formal-late-9','standard').accepted,false);
    const express=search.quote('formal-late-9','express');
    assert(express.accepted);
    assert.equal(express.candidate.priceCents,9400);
    assert(express.candidate.arrival<=requirements.deadline);
    assert.equal(read(db,'stock','formal-late-9'),undefined);
    const receipt=reserve(db,express.candidate.quoteId,'request-1',now);
    assert.deepEqual(reserve(db,express.candidate.quoteId,'request-1',now),receipt);
    assert.equal(read(db,'stock','formal-late-9'),4);
  } finally {db.close();}
});
test('supplier refuses an over-budget express route, sold-out item and uninspected quote',()=>{
  const db=database(':memory:');
  try {
    const search=new SourcingInvestigation(db,{...requirements,maxPriceCents:9000},now);
    assert.throws(()=>search.quote('formal-black-9','standard'),/Inspect/);
    search.inspect('formal-late-9');
    assert.equal(search.quote('formal-late-9','express').accepted,false);
    search.inspect('formal-black-9');
    write(db,'stock','formal-black-9',0);
    assert.equal(search.quote('formal-black-9','standard').accepted,false);
  } finally {db.close();}
});
test('shopping forwards actual customer turns and persists task continuity across instances without inventing approval',async()=>{
  const db=database(':memory:');
  const calls:Array<{input:unknown;previous:unknown}>=[];
  const result:RemoteResult={taskId:'retail-task',contextId:'retail-context',state:'input-required',question:'Reply 1 to confirm or 2 to decline'};
  const remote:Remote={async send(input,previous){calls.push({input,previous});return result;}};
  try {
    const messages=[{role:'user',id:'u1',content:'Find shoes, but do not reserve yet.'},{role:'assistant',content:'1'}];
    await new ShoppingDelegation(db,remote).forward('alex','thread-a',messages);
    await new ShoppingDelegation(db,remote).forward('alex','thread-a',messages);
    assert.equal(calls.length,1);
    assert.equal(calls[0].input,'Find shoes, but do not reserve yet.');
    await new ShoppingDelegation(db,remote).forward('alex','thread-a',[{role:'user',id:'u2',content:{parts:[{type:'text',text:'1'}]}}]);
    assert.equal(calls[1].input,'1');
    assert.equal((calls[1].previous as RemoteResult).taskId,'retail-task');
    await new ShoppingDelegation(db,remote).forward('other-customer','thread-a',[{role:'user',id:'u3',content:'Where is my order?'}]);
    assert.equal(calls[2].previous,undefined);
    await new ShoppingDelegation(db,remote).forward('alex','thread-b',[{role:'user',id:'u4',content:'Where is my order?'}]);
    assert.equal(calls[3].previous,undefined);
  } finally {db.close();}
});
test('a revised sourcing request invalidates the old proposal even if the supplier fails',async()=>{
  const db=database(':memory:'); const store=openExchangeStore(':memory:'); seedExchangeStore(store);
  const r={...requirements,deadline:new Date(Date.now()+72*3600000).toISOString()};
  const remote:Remote={async send(){throw new Error('offline');}};
  const service=new ResolutionService(db,store,remote,remote);
  const state={id:'resolution',orderId:'order-2001',sku:'shoe-black-9',trackingId:'tracking',requirements:r,creditCents:9900,phase:'awaiting_confirmation',delivery:{state:'completed',data:{outcome:'too_late',findings:['Recovery misses deadline'],recoveryAt:new Date(Date.now()+96*3600000).toISOString(),reference:'finding'}},proposal:{sku:'old'},proposalTurn:'old-turn',options:[]};
  // Use the actual seeded SKU so this test exercises the zero-local-stock gate.
  const inventory=store.prepare('SELECT sku FROM inventory WHERE available=0').get() as {sku:string};
  state.sku=inventory.sku;
  write(db,service.scope('customer-alex','thread'),'active',state);
  try {
    const revised=await service.source('customer-alex','thread',{requirements:{...r,preferences:'Brown shoes'},excludedSkus:['formal-black-9']});
    assert.equal(revised.phase,'needs_review');
    assert.equal(revised.proposal,undefined);
    assert.equal(revised.options,undefined);
    assert.deepEqual(revised.excludedSkus,['formal-black-9']);
    assert.equal((await service.source('customer-alex','thread')).phase,'needs_review');
    await assert.rejects(()=>service.source('customer-alex','thread',{requirements:{...r,deadline:new Date(Date.now()+120*3600000).toISOString()},excludedSkus:[]}),/Recovery now fits/);
    await assert.rejects(()=>service.confirm('customer-alex','thread','confirm','next-turn'),/No replacement proposal/);
  } finally {db.close();store.close();}
});
