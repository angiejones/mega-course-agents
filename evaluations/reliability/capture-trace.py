"""Capture the selected model draft through the running isolated Studio viewer."""
import json,sys
from pathlib import Path
from urllib.request import urlopen
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from studio import sync_traces
row=next(r for r in json.loads((root/'reliability/guardrail-results.json').read_text()) if r['id']=='email')
sync_traces()
with urlopen('http://127.0.0.1:4178/api/observability/traces/'+row['traceId'],timeout=10) as response:
 trace=json.load(response)
assert trace['traceId']==row['traceId']
spans=[{k:s.get(k) for k in ['traceId','spanId','name','spanType','input','output']} for s in trace['spans'] if s['spanType'] in ['model_inference','processor_run']]
assert any(s['spanType']=='model_inference' and isinstance(s['output'],dict) and s['output'].get('text') for s in spans)
(root/'reliability/email-trace.json').write_text(json.dumps({'traceId':row['traceId'],'spans':spans},indent=2))
print('Saved model draft and processor spans from the verified Studio trace.')
