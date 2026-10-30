"""Prepare evidence for human labeling before running the response judge."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
target=root/'reliability/scoring-samples.json'
if target.exists():raise SystemExit('scoring-samples.json already exists; preserve your labels or rename it before preparing a new set.')
pairs=json.loads((root/'reliability/comparison-selection.json').read_text())
rows=[]
for index,pair in enumerate(pairs[:2]):
 for variant,run in zip(['baseline','fixed'],pair):
  evidence=json.loads((root/'results'/run/'evidence.json').read_text());turn=evidence['events'][2]
  rows.append({'id':variant+('-repeat' if index else ''),'run':run,'turn':2,'expected':[None,None],'criteriaOrder':['grounded','next_step'],'response':turn['text'],'customerMessages':[t['message'] for t in evidence['events'][1:3]],'store':turn['snapshot'],'toolResults':turn['toolResults']})
target.write_text(json.dumps(rows,indent=2))
print('Review reliability/scoring-samples.json. Set expected to your groundedness and next-step labels before running score.ts.')
