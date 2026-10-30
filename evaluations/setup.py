"""Prepare an isolated baseline using the current agent and the original exchange tool."""
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent
baseline=ROOT/'.baseline'
if baseline.exists():
    raise SystemExit('Baseline already exists. Remove evaluations/.baseline only if you want to rebuild it.')
if not (REPO/'node_modules/tsx').exists():
    raise SystemExit('Run npm ci in the repository first.')
baseline.mkdir()
for name in ['apps','packages','scripts','agents','services','skills','fixtures']:
    shutil.copytree(REPO/name,baseline/name,ignore=shutil.ignore_patterns('node_modules','.mastra','dist','__pycache__','*.db','*.db-*','.env*'))
for name in ['package.json','tsconfig.json']:
    shutil.copy2(REPO/name,baseline/name)
shutil.copy2(ROOT/'fixtures/baseline-tool.ts',baseline/'packages/exchanges/tool.ts')
(baseline/'node_modules').symlink_to(REPO/'node_modules',target_is_directory=True)
(ROOT/'results').mkdir(exist_ok=True)
print('Baseline prepared. It differs only in the original exchange proposal reuse logic.')
