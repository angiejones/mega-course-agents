"""Compare matched scenarios only; preserve every selected run, including failures."""
import json,statistics,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from environment import CourseEnvironment,CustomerAction,ROOT
from run import SCENARIOS
selection=ROOT/'reliability/comparison-selection.json'
if not selection.exists(): raise SystemExit('Run reliability/record-cost-comparison.py first.')
pairs=json.loads(selection.read_text())
rows=[]
for pair_index,pair in enumerate(pairs):
 for variant,identifier in zip(['baseline','fixed'],pair):
  e=json.loads((ROOT/'results'/identifier/'evidence.json').read_text())
  assert e['state']['scenario']=='late_defect' and e['result']['done']
  turns=e['events'][1:]
  assert [t['message'] for t in turns]==SCENARIOS['late_defect']
  calls=[x.get('payload',{}).get('toolName','unknown') for t in turns for x in t.get('toolCalls',[])]
  usage=lambda k:sum(t.get('usage',{}).get(k,0) or 0 for t in turns)
  rows.append({'pair':pair_index+1,'variant':variant,'runId':identifier,'passed':e['result']['reward']==1,'checks':e['result']['checks'],
    'seconds':round(sum(t['elapsedMs'] for t in turns)/1000,2),'inputTokens':usage('inputTokens'),'outputTokens':usage('outputTokens'),
    'totalTokens':usage('totalTokens'),'toolCalls':len(calls),'toolCounts':{n:calls.count(n) for n in sorted(set(calls))},
    'model':e['events'][0]['runtime']['model'],'turns':[{'number':i+1,'seconds':round(t['elapsedMs']/1000,2),'traceId':t.get('traceId'),'toolNames':[x.get('payload',{}).get('toolName') for x in t.get('toolCalls',[])]} for i,t in enumerate(turns)]})
assert len({r['model'] for r in rows})==1
summary={}
for variant in ['baseline','fixed']:
 r=[x for x in rows if x['variant']==variant]
 summary[variant]={'runs':len(r),'passed':sum(x['passed'] for x in r),'meanSeconds':round(statistics.mean(x['seconds'] for x in r),2),'meanTokens':round(statistics.mean(x['totalTokens'] for x in r)), 'meanToolCalls':round(statistics.mean(x['toolCalls'] for x in r),2)}
result={'scenario':'Defect disclosed after quote','selection':'Three matched baseline/current-agent pairs. All selected outcomes are retained.','limits':'Small sequential sample, not a speed benchmark. Cache, provider latency and model variation can affect timings. Agent time excludes environment startup and cleanup. Token and tool-call averages cover the retail agent; Jev calls and costs appear separately below. A successful runtime trace can fail the retail evaluation.','summary':summary,'rows':rows,'slowest':max(rows,key=lambda r:r['seconds'])['runId']}
(ROOT/'reliability/comparison-results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(summary),flush=True)
