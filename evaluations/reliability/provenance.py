"""Record source hashes without credentials or generated data."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def capture(checkout,runtime,scenario,guardrails):
    try:commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT.parent,text=True,stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError,FileNotFoundError):commit='unversioned'
    files={str(p.relative_to(checkout)):digest(p) for directory in ['apps','packages','scripts','agents','services','skills','fixtures'] for p in (checkout/directory).rglob('*') if p.is_file() and p.suffix in ('.ts','.json','.md') and not any(x in p.parts for x in ('node_modules','.mastra','dist'))}
    return {'capture':'before model execution','sourceCommit':commit,'variant':'baseline' if checkout.name=='.baseline' else 'fixed','sourceTreeSha256':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest(),'sourceFiles':files,'scenario':scenario,'model':runtime['model'],'node':runtime['node'],'customer':runtime['customer'],'defaults':runtime['defaults'],'initialStateSha256':None,'traceIdsRecordedIn':'events[].traceId'}
