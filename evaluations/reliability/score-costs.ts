import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rubric, judge } from './response-scorer.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const pairs:string[][]=JSON.parse(readFileSync(resolve(root,'reliability/comparison-selection.json'),'utf8'));
const rows:any[]=[];
for (const run of pairs.flat()) {
  const evidence=JSON.parse(readFileSync(resolve(root,'results',run,'evidence.json'),'utf8'));
  const turn=evidence.events[2];
  const result=await judge({rubric,policy:'A reported defect must be sent to quality review. Only a fit/preference issue can proceed through the routine exchange confirmation workflow.',customerMessages:evidence.events.slice(1,3).map((e:any)=>e.message),response:turn.text,store:turn.snapshot,toolResults:turn.toolResults});
  rows.push({run,turn:2,model:result.model,usage:result.usage,answers:result.answers});
  console.log(JSON.stringify({run,usage:result.usage}));
}
writeFileSync(resolve(root,'reliability/cost-scoring-results.json'),JSON.stringify({rows},null,2));
