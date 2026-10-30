"""Loopback UI/API for the bounded course-agent validation harness."""
import sys,argparse,json,mimetypes,re,threading,time,uuid
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlparse
from urllib.request import urlopen
from environment import CourseEnvironment,CustomerAction
from run import SCENARIOS
from studio import sync_traces
from costs import for_run

ROOT=Path(__file__).resolve().parent
RESULTS=ROOT/'results'
RESULTS.mkdir(exist_ok=True)
JOBS={};LOCK=threading.Lock();ACTIVE=None;ACTIVE_ENV=None
TITLES={'late_defect':('A defect after the quote','A broken zipper changes an exchange already awaiting confirmation.'),
 'standard':('A normal size exchange','Confirm a fit-only exchange and verify one inventory change.'),
 'defect':('A defect from the start','Keep the reported defect in the quality-review request.'),
 'revision':('A different replacement','Change the replacement before confirming.'),
 'ownership':('Another customer’s order','Check that signed-in identity controls access.')}

def run_path(identifier):
    if not isinstance(identifier,str) or not re.fullmatch(r'[A-Za-z0-9_-]+',identifier):raise ValueError('Invalid run identifier')
    path=(RESULTS/identifier).resolve()
    if path.parent!=RESULTS.resolve() or not (path/'evidence.json').is_file():raise ValueError('Run not found')
    return path

def summarize(path,evidence):
    events=evidence['events'];runtime=events[0]['runtime'];turns=events[1:]
    final=turns[-1]['snapshot'] if turns else events[0]['snapshot']
    result=evidence.get('result') or {};status='completed' if result.get('done') else 'running'
    variant='baseline' if runtime.get('checkout','').endswith('.baseline') or path.name.startswith('baseline') else 'fixed'
    costs=for_run(path,evidence)
    return {'id':path.name,'scenario':evidence['state']['scenario'],'variant':variant,'label':path.name,
        'status':status,'reward':result.get('reward'),'checks':result.get('checks',{}),'turn_count':len(turns),
        'created_at':datetime.fromtimestamp(path.stat().st_ctime,timezone.utc).isoformat(),
        'model':runtime['model'],'trace_ids':[t['traceId'] for t in turns if t.get('traceId')],
        'exchange_count':len(final['exchanges']),'quality_referral_count':len(final['reviews']),
        'elapsed_seconds':round(sum(t.get('elapsedMs',0) for t in turns)/1000,2),
        'estimated_openai_usd':costs['execution']['agentUsd'],'costs':costs}

def read_run(identifier):
    path=run_path(identifier);e=json.loads((path/'evidence.json').read_text());return summarize(path,e),e

def all_runs():
    rows=[]
    for path in RESULTS.iterdir():
        if path.name.startswith('guardrail-'):continue # Processor cases have their own checks and evaluation view.
        if not path.is_dir() or not (path/'evidence.json').is_file():continue
        try:
            e=json.loads((path/'evidence.json').read_text())
            if 'events' in e:rows.append(summarize(path,e))
        except (ValueError,KeyError,json.JSONDecodeError):continue
    return sorted(rows,key=lambda x:x['created_at'],reverse=True)

def studio_info(run,trace_id=None,refresh=False):
    ids=run['trace_ids']
    if trace_id and trace_id not in ids:raise ValueError('Trace does not belong to this run')
    if refresh:sync_traces()
    selected=trace_id or (ids[0] if ids else None)
    trace_urls={i:f'http://127.0.0.1:4178/traces?traceId={i}' for i in ids}
    ready=False
    if selected:
        try:
            with urlopen(f'http://127.0.0.1:4178/api/observability/traces/{selected}',timeout=1) as response:
                body=response.read().decode();ready=response.status==200 and selected in body
        except Exception:pass
    command=f'{sys.executable} {ROOT}/studio.py'
    return {'status':'ready' if ready else 'instructions','url':trace_urls.get(selected),
        'trace_urls':trace_urls,'command':command,
        'instructions':'Open the verified trace in the isolated Studio viewer.' if ready else 'Start the isolated Studio viewer with this command, then open the trace again.',
        'verified':ready}

def perform_job(identifier,scenario,variant):
    global ACTIVE,ACTIVE_ENV
    job=JOBS[identifier];env=CourseEnvironment();ACTIVE_ENV=env
    try:
        job['status']='running';job['progress'].append({'type':'setup','message':'Preparing a fresh, isolated store.'})
        env.reset(scenario=scenario,label=f'ui-{variant}',variant=variant)
        job['run_id']=env.directory.name
        for index,message in enumerate(SCENARIOS[scenario]):
            job['progress'].append({'type':'turn','turn':index+1,'message':f'Running customer turn {index+1} of {len(SCENARIOS[scenario])}.'})
            observation=env.step(CustomerAction(message=message,finish=index==len(SCENARIOS[scenario])-1))
            job['progress'].append({'type':'reply','turn':index+1,'message':'Agent reply and store checks saved.'})
        job['progress'].append({'type':'saving','message':'Saving the final traces.'})
    except Exception as error:
        job['status']='failed';job['error']=f'Run failed ({type(error).__name__}). See the local runtime log.'
    finally:
        try:env.close()
        except Exception:
            job['status']='failed';job['error']='The run could not finish saving its traces.'
        synced=True
        try:sync_traces()
        except Exception:synced=False
        job['studio_synced']=synced
        if job['status']!='failed':
            job['status']='completed';job['progress'].append({'type':'completed','message':'Run complete. Results and traces are ready.' if synced else 'Results saved. Retry the Studio action to import traces.'})
        ACTIVE_ENV=None
        with LOCK:ACTIVE=None

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):pass
    def respond(self,value,status=200):
        data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def allowed_host(self):return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')
    def do_GET(self):
        if not self.allowed_host():return self.respond({'error':'Loopback host required'},403)
        path=urlparse(self.path).path
        try:
            if path=='/api/runs':return self.respond({'runs':all_runs(),'scenarios':[{'id':k,'title':v[0],'description':v[1]} for k,v in TITLES.items()],'active_job':ACTIVE})
            if path.startswith('/api/runs/'):
                run,e=read_run(unquote(path[len('/api/runs/'): ]));return self.respond({'run':run,'evidence':e,'studio':studio_info(run)})
            if path.startswith('/api/jobs/'):
                job=JOBS.get(path[len('/api/jobs/'):]);return self.respond(job or {'error':'Job not found'},200 if job else 404)
            root=(ROOT/'ui').resolve();file=(root/('index.html' if path=='/' else unquote(path).lstrip('/'))).resolve()
            if root not in file.parents or not file.is_file():return self.respond({'error':'Not found'},404)
            data=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        except (ValueError,KeyError,json.JSONDecodeError):self.respond({'error':'Run unavailable'},404)
    def do_POST(self):
        global ACTIVE
        if not self.allowed_host() or self.headers.get('Origin') not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
            return self.respond({'error':'Same-origin loopback request required'},403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>4096 or self.headers.get_content_type()!='application/json':raise ValueError('Expected small JSON request')
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):raise ValueError('Expected JSON object')
            if self.path=='/api/runs':
                if set(body)!={'scenario','variant'} or not isinstance(body['scenario'],str) or body['scenario'] not in SCENARIOS or body['variant'] not in ('baseline','fixed'):raise ValueError('Invalid scenario or variant')
                with LOCK:
                    if ACTIVE:return self.respond({'error':'A run is already active','job_id':ACTIVE},409)
                    identifier=str(uuid.uuid4());ACTIVE=identifier
                    JOBS[identifier]={'id':identifier,'status':'queued','run_id':None,'progress':[]}
                threading.Thread(target=perform_job,args=(identifier,body['scenario'],body['variant']),daemon=True).start()
                return self.respond({'job_id':identifier},202)
            if self.path=='/api/studio':
                if set(body)-{'run_id','trace_id'} or 'run_id' not in body:raise ValueError('Invalid studio request')
                run,_=read_run(body['run_id']);return self.respond(studio_info(run,body.get('trace_id'),refresh=True))
            self.respond({'error':'Not found'},404)
        except (ValueError,KeyError,json.JSONDecodeError) as error:self.respond({'error':str(error)},400)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8768);parser.add_argument('--duration',type=int,default=0);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    if args.duration:threading.Timer(args.duration,server.shutdown).start()
    print(f'Course validation view: http://127.0.0.1:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        if ACTIVE_ENV:ACTIVE_ENV.close()

if __name__=='__main__':main()
