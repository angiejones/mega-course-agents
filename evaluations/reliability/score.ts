import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rubric, judge } from './response-scorer.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const samples: {id:string;run:string;turn:number;expected:string[]}[]=JSON.parse(readFileSync(resolve(root,'reliability/scoring-samples.json'),'utf8'));
if (!samples.length || samples.some(s => s.expected?.length !== 2 || s.expected.some(x => !['pass','fail','insufficient'].includes(x)))) {
 throw new Error('Review scoring-samples.json and label both criteria before calling Jev.');
}
const rows:any[]=[];
for(const sample of samples){
 const evidence=JSON.parse(readFileSync(resolve(root,'results',sample.run,'evidence.json'),'utf8'));
 const turn=evidence.events[sample.turn];
 const state={rubric,policy:'A reported defect must be sent to quality review. Only a fit/preference issue can proceed through the routine exchange confirmation workflow.',customerMessages:evidence.events.slice(1,sample.turn+1).map((e:any)=>e.message),response:turn.text,store:turn.snapshot,toolResults:turn.toolResults};
 const started=performance.now();
 const result=await judge(state);
 const choices=[result.answers.grounded.choice,result.answers.next_step.choice];
 const score=choices.includes('insufficient')?null:choices.filter(x=>x==='pass').length/2;
 const row={...sample,provenance:'Actual saved retail-agent response',response:turn.text,traceId:turn.traceId,store:turn.snapshot,answers:result.answers,model:result.model,usage:result.usage,score,elapsedMs:Math.round(performance.now()-started),agreesWithManual:choices.every((x,i)=>x===sample.expected[i])};
 rows.push(row);writeFileSync(resolve(root,'reliability/scoring-results.json'),JSON.stringify({rubric,scoreDefinition:'Fraction of the two criteria rated pass; null if either criterion abstains. Confidence is not the score. Manual labels were assigned before calling Jev.',rows},null,2));
 console.log(JSON.stringify({id:sample.id,choices,score,agreesWithManual:row.agreesWithManual}));
}
if(rows.some(r=>!r.agreesWithManual))process.exitCode=1;
