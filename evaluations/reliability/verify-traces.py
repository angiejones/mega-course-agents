"""Verify saved guardrail behavior against the actual Mastra trace spans."""
import json,sys
from pathlib import Path
from urllib.request import urlopen
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from studio import sync_traces
sync_traces()
rows=json.loads((root/'reliability/guardrail-results.json').read_text())
assert len(rows)==6 and all(r['passed'] for r in rows)
verified=[]
for row in rows:
 with urlopen('http://127.0.0.1:4178/api/observability/traces/'+row['traceId'],timeout=10) as response:
  trace=json.load(response)
 assert trace['traceId']==row['traceId']
 spans=trace['spans']
 if row['id']=='card':
  assert not any(s['spanType'] in ['model_generation','model_inference','tool_call'] for s in spans)
 if row['id']=='email':
  processors=[s for s in spans if s['spanType']=='processor_run' and 'retail-contact-output' in s['name']]
  assert processors
  assert any('jordan@personal.example' in json.dumps(s['input']) for s in processors)
  assert any('support@store.example' in json.dumps(s['output']) for s in processors)
  for processor in processors:
   messages=processor['output']['messages']
   text=[]
   tool_results=[]
   for message in messages:
    if message.get('role')!='assistant':continue
    content=message['content']
    if isinstance(content.get('content'),str):text.append(content['content'])
    text.extend(p['text'] for p in content.get('parts',[]) if p.get('type')=='text')
    tool_results.extend(p['toolInvocation']['result'] for p in content.get('parts',[]) if p.get('type')=='tool-invocation' and p.get('toolInvocation',{}).get('toolName')=='getSupportContact')
   assert text and all('jordan@personal.example' not in t.lower() for t in text)
   assert any('support@store.example' in t for t in text)
   assert any(r.get('email')=='jordan@personal.example' for r in tool_results), 'The original tool evidence must remain intact'

 verified.append({'case':row['id'],'traceId':trace['traceId'],'verified':True})
(root/'reliability/verification.json').write_text(json.dumps({'guardrailTraces':verified},indent=2))
print('Verified all six traces, blocked input with no model/tool work, and complete private staff address replacement.')
