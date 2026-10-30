"""Record matched runs with usage; retain every outcome and previous selection."""
import json,sys,shutil
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from environment import CourseEnvironment,CustomerAction,ROOT
from run import SCENARIOS
from costs import for_run
backup=ROOT/'retakes'/('costs-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True)
for name in ['comparison-selection.json','comparison-results.json','scoring-results.json','cost-scoring-results.json']:
 if (ROOT/'reliability'/name).exists(): shutil.copy2(ROOT/'reliability'/name,backup/name)
pairs=[]
for pair in range(3):
 ids=[]
 for variant in ['baseline','fixed']:
  env=CourseEnvironment()
  try:
   env.reset(scenario='late_defect',variant=variant,label='costs-'+variant)
   print('Recording',pair+1,variant,env.directory.name,flush=True)
   for index,message in enumerate(SCENARIOS['late_defect']):
    observation=env.step(CustomerAction(message=message,finish=index==2))
   evidence=json.loads((env.directory/'evidence.json').read_text())
   assert for_run(env.directory,evidence,[])['execution']['totalUsd'] is not None, 'Usage missing'
   ids.append(env.directory.name)
   print('Completed',pair+1,variant,'reward',observation.reward,flush=True)
  finally:env.close()
 pairs.append(ids)
 (ROOT/'reliability/cost-comparison-progress.json').write_text(json.dumps(pairs,indent=2))
(ROOT/'reliability/comparison-selection.json').write_text(json.dumps(pairs,indent=2))
print('All six runs saved',flush=True)
