"""Isolated Mastra Studio for copies of the saved course traces."""
import shutil,argparse,json,os,signal,sqlite3,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
VIEWER=ROOT/'studio-viewer'
DB=VIEWER/'traces.db'
NODE=shutil.which('node') or 'node'

def sync_traces():
    VIEWER.mkdir(exist_ok=True)
    sources=sorted((ROOT/'results').glob('*/agent.db'))
    sources=[p for p in sources if (p.parent/'evidence.json').exists()]
    if not sources:raise ValueError('No recorded trace databases found')
    if not DB.exists():
        with sqlite3.connect(f'file:{sources[0]}?mode=ro',uri=True) as source,sqlite3.connect(DB) as target:
            source.backup(target)
    counts={}
    with sqlite3.connect(DB,timeout=15) as target:
        for path in sources:
            with sqlite3.connect(f'file:{path}?mode=ro',uri=True) as source:
                try:
                    columns=[r[1] for r in source.execute('PRAGMA table_info(mastra_ai_spans)')]
                    rows=source.execute('SELECT * FROM mastra_ai_spans').fetchall()
                except sqlite3.OperationalError:continue
                if not columns:continue
                quoted=','.join('"'+c+'"' for c in columns)
                # Refresh previously imported in-progress spans after a run finishes.
                target.executemany(f'INSERT OR REPLACE INTO mastra_ai_spans ({quoted}) VALUES ({",".join("?" for _ in columns)})',rows)
                counts[path.parent.name]=len(rows)
    (VIEWER/'imported-traces.json').write_text(json.dumps(counts,indent=2))
    return counts

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--duration',type=int,default=0);parser.add_argument('--sync-only',action='store_true');args=parser.parse_args()
    counts=sync_traces();print(json.dumps({'databases':len(counts),'span_rows':sum(counts.values()),'url':'http://127.0.0.1:4178/traces'}),flush=True)
    if args.sync_only:return
    env={k:os.environ[k] for k in ('HOME','PATH','TMPDIR','LANG') if k in os.environ}
    env['PATH']=str(Path(NODE).parent)+os.pathsep+env.get('PATH','');env['VIEWER_DB_PATH']=str(DB)
    child=subprocess.Popen([NODE,str(ROOT.parent/'node_modules/mastra/dist/index.js'),'dev','--dir','src'],cwd=VIEWER,env=env,start_new_session=True)
    def stop(*_):
        if child.poll() is None:
            os.killpg(child.pid,signal.SIGTERM)
            try:child.wait(timeout=8)
            except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
    signal.signal(signal.SIGTERM,lambda *_:(stop(),exit(0)))
    try:child.wait(timeout=args.duration if args.duration else None)
    except (subprocess.TimeoutExpired,KeyboardInterrupt):pass
    finally:stop()

if __name__=='__main__':main()
