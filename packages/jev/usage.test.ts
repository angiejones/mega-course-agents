import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withJevUsage, recordJevCall, type JevCall } from './usage.ts';
test('usage stays with its request, including failed calls', async () => {
 const a:JevCall[]=[],b:JevCall[]=[];
 const result={model:'jev-1.13.0',usage:{input_tokens:100,output_tokens:20}};
 await Promise.all([
  withJevUsage(a,()=>recordJevCall(result.model,async()=>{await Promise.resolve();return result})),
  withJevUsage(b,async()=>{await assert.rejects(recordJevCall(result.model,async()=>{throw new Error('provider failed')}),/provider failed/)})
 ]);
 assert.deepEqual(a,[{...result,status:'completed'}]);
 assert.deepEqual(b,[{model:result.model,status:'failed'}]);
});
