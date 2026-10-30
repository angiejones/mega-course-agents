import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from costs import for_run, jev_cost, PRICING, load_scoring
data={}
for key,name in [('security','security-results.json'),('scoring','scoring-results.json'),('guardrails','guardrail-results.json'),('comparison','comparison-results.json')]:
 path=root/'reliability'/name
 data[key]=json.loads(path.read_text()) if path.exists() else None
trace_file=root/'reliability/email-trace.json'
if trace_file.exists() and data['guardrails']:
 trace=json.loads(trace_file.read_text())
 row=next(r for r in data['guardrails'] if r['id']=='email')
 assert trace['traceId']==row['traceId']
 spans=[s for s in trace['spans'] if s['spanType']=='model_inference' and s.get('output',{}).get('text')]
 row['rawModelResponse']=spans[-1]['output']['text']
 row['rawResponseSource']='Saved Mastra model_inference span before the output processor'
 evidence=json.loads((root/'results'/row['runId']/'evidence.json').read_text())
 row['supportContact']=next(t['payload']['result'] for e in evidence['events'] for t in e.get('toolResults',[]) if t.get('payload',{}).get('toolName')=='getSupportContact')
costs={}
scoring_rows=load_scoring()
(root/'results').mkdir(exist_ok=True)
for path in (root/'results').iterdir():
 if (path/'evidence.json').is_file():
  evidence=json.loads((path/'evidence.json').read_text())
  if 'events' in evidence:
   costs[path.name]=for_run(path,evidence,scoring_rows)
for row in (data['comparison'] or {}).get('rows',[]):
 row['costs']=costs[row['runId']]
 assert row['costs']['execution']['totalUsd'] is not None, 'Record comparison runs with Jev usage before publishing'
 assert row['costs']['evaluation'] and row['costs']['evaluation']['usd'] is not None, 'Score every selected comparison run before publishing'
for row in (data['scoring'] or {}).get('rows',[]):
 row['costs']=jev_cost([row])
data['pricing']=PRICING
(root/'ui/cost-data.json').write_text(json.dumps(costs,indent=2))
(root/'ui/reliability-data.json').write_text(json.dumps(data,indent=2))
print('Published saved evaluation evidence to ui/reliability-data.json')
