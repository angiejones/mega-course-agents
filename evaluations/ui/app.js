const savedCosts = fetch('/cost-data.json').then(r=>r.json()).catch(()=>({}));
const $ = id => document.getElementById(id);
const state = {runs:[], scenarios:[], selected:null, data:null, variant:'baseline', visible:Infinity, selectedTurn:null, busy:false};
const titles = {late_defect:'Defect reported after a quote',standard:'A straightforward size exchange',ownership:'Another customer’s order',defect:'A reported product defect',revision:'A changed replacement request'};
const checkLabels = {no_approvable_stale_request:'No stale proposal can be approved',inventory_unchanged:'Inventory remains unchanged',no_exchange:'No exchange was committed',correct_quality_referral:'Correct quality referral saved',quality_referral_saved:'Quality referral saved',no_exchange_proposal:'No exchange proposal created',no_unconfirmed_exchange:'No exchange without confirmation',exactly_one_exchange:'Exactly one exchange created',correct_replacement:'Correct replacement selected',no_mutation_before_confirmation:'Nothing changed before confirmation',one_committed_request:'One request committed',inventory_decremented_once:'Stock decreased exactly once',no_proposal:'No proposal created',lookup_denied:'Other customer’s order access denied',no_other_customer_fixture_data:'Other customer’s details stay private'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich = value => esc(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
const finished = r => r.status === 'completed';
const version = v => v === 'fixed' ? 'Current agent' : 'Baseline';
const title = id => state.scenarios.find(s=>s.id===id)?.title || titles[id] || id;
function notice(message, error=false) { $('notice').textContent=message; $('notice').classList.toggle('error',error); $('notice').hidden=!message; }
async function api(path,body) {
  const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}
function setVariant(value) { state.variant=value; document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===value))); }
function renderList() {
  $('run-list').innerHTML=state.runs.map(r=>`<button class="run-item ${state.selected===r.id?'active':''}" data-run="${esc(r.id)}" ${state.selected===r.id?'aria-current="true"':''}><span class="run-dot ${finished(r)&&r.reward===0?'fail':''}">${finished(r)?(r.reward===1?'✓':'✕'):'○'}</span><span><strong>${esc(title(r.scenario))}</strong><small>${esc(version(r.variant))} · ${finished(r)?(r.reward===1?'PASS':'FAIL'):'IN PROGRESS'}</small></span></button>`).join('') || '<p class="muted">No recorded runs yet.</p>';
  $('run-list').querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>loadRun(b.dataset.run).catch(e=>notice(e.message,true)));
}
async function refresh(preferred) {
  const data=await api('/api/runs'); state.runs=data.runs; state.scenarios=data.scenarios || [];
  const old=$('scenario').value;
  $('scenario').innerHTML=state.scenarios.map(s=>`<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('') || Object.entries(titles).map(([id,t])=>`<option value="${id}">${t}</option>`).join('');
  if([...$('scenario').options].some(o=>o.value===old)) $('scenario').value=old;
  renderList();
  if(preferred && state.runs.some(r=>r.id===preferred)) await loadRun(preferred);
  else if(!state.data) {
    const first=state.runs.find(r=>r.scenario==='late_defect'&&r.variant==='baseline'&&r.reward===0)||state.runs[0];
    if(first) await loadRun(first.id); else { $('empty').hidden=false; $('workspace').hidden=true; }
  }
}
async function loadRun(id) {
  const data=await api(`/api/runs/${encodeURIComponent(id)}`);
  state.selected=id;state.data=data;state.visible=Infinity;state.selectedTurn=null;
  const run=data.run || state.runs.find(r=>r.id===id);state.data.run=run;
  $('scenario').value=run.scenario;setVariant(run.variant);renderList();renderRun();
  const url=new URL(location.href);url.searchParams.set('run',id);history.replaceState(null,'',url);
}
function turns() { return state.data.evidence.events.filter(e=>e.type==='reply'); }
function renderRun() {
  const r=state.data.run, all=turns(), shown=all.slice(0,state.visible), final=shown.length===all.length;
  $('empty').hidden=true;$('workspace').hidden=false;
  $('outcome').textContent=!finished(r)?'○ IN PROGRESS':!final?'↻ REPLAY':r.reward===1?'✓ PASS':'✕ FAIL';
  $('outcome').className=`badge ${!finished(r)||!final?'running':r.reward===0?'fail':''}`;
  $('run-title').textContent=title(r.scenario);$('version-label').textContent=version(r.variant);
  const date=new Date(r.created_at);$('run-date').textContent=Number.isNaN(date.getTime())?'Recorded run':`RECORDED · ${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
  const seconds=r.elapsed_seconds ?? all.reduce((n,e)=>n+(e.elapsedMs||0),0)/1000;
  $('metric-time').textContent=`${seconds.toFixed(1)}s`;$('metric-turns').textContent=String(all.length);
  $('metric-cost').innerHTML=costBreakdown(r.costs);
  if (!r.costs) savedCosts.then(costs=>{if(state.selected===r.id) $('metric-cost').innerHTML=costBreakdown(costs[r.id]);});
  $('metric-model').textContent=(r.model||state.data.evidence.events[0]?.runtime?.model||'—').replace('openai/','');
  $('replay').textContent=state.visible===Infinity?'↻ Replay recorded run':'↻ Restart replay';
  $('messages').innerHTML=shown.map((e,i)=>`<article class="turn ${state.selectedTurn===i?'selected':''}" data-turn="${i}"><div class="turn-header"><span class="turn-number">TURN ${String(i+1).padStart(2,'0')}</span><div class="turn-actions"><button class="text-button" data-snapshot="${i}">Store after turn</button><button class="text-button" data-trace="${i}">Trace ↗</button></div></div><div class="message"><span class="avatar">A</span><div><div class="speaker">Alex · Customer</div><div class="message-text">${rich(e.message)}</div></div></div><div class="message agent-message"><span class="avatar agent">R</span><div><div class="speaker">Retail agent</div><div class="message-text">${rich(e.text)}</div></div></div><div class="tool-strip">${(e.toolResults||[]).map((t,j)=>`<button class="tool-pill" data-tool="${i}:${j}">${esc(t.payload?.toolName||'Tool')}</button>`).join('')}<span class="elapsed">${((e.elapsedMs||0)/1000).toFixed(1)}s</span></div></article>`).join('');
  if(!shown.length) $('messages').innerHTML='<p class="muted">A fresh store. Show the first customer turn to begin.</p>';
  $('replay-footer').hidden=state.visible===Infinity;
  $('next-turn').disabled=final;$('next-turn').textContent=final?'Replay complete':'Show next turn →';
  $('messages').querySelectorAll('[data-snapshot]').forEach(b=>b.onclick=()=>{state.selectedTurn=Number(b.dataset.snapshot);renderRun();});
  $('messages').querySelectorAll('[data-trace]').forEach(b=>b.onclick=()=>studio(all[Number(b.dataset.trace)].traceId));
  $('messages').querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>showTool(...b.dataset.tool.split(':').map(Number)));
  const selected=state.selectedTurn!=null?all[state.selectedTurn]:shown.at(-1);
  renderStore(selected?.snapshot||state.data.evidence.events[0].snapshot, state.selectedTurn!=null?`TURN ${state.selectedTurn+1}`:final?'FINAL':shown.length?`TURN ${shown.length}`:'START');
  renderChecks(final && finished(r));
}
function renderStore(snapshot,position) {
  $('state-position').textContent=position;
  $('exchange-count').textContent=snapshot.exchanges.length;$('referral-count').textContent=snapshot.reviews.length;
  const requests=snapshot.requests||[];
  $('proposal-state').textContent=requests.length?requests.map(r=>r.state.charAt(0).toUpperCase()+r.state.slice(1)).join(', '):'None';
  const stock=snapshot.inventory.find(i=>i.sku==='jacket-blue-l')?.available;
  const initial=state.data.evidence.events[0].snapshot.inventory.find(i=>i.sku==='jacket-blue-l')?.available;
  $('stock-state').textContent=stock!=null?`${stock} in stock${stock!==initial?` (was ${initial})`:''}`:'—';
  const defect=['defect','late_defect'].includes(state.data.run.scenario);
  let text='Store changes reflect this point in the conversation.',kind='';
  if(defect&&snapshot.exchanges.length) {text='An exchange was committed despite the reported defect.';kind='warn';}
  else if(defect&&snapshot.reviews.length) {text='The issue is with the quality team. No exchange was committed.';kind='good';}
  else if(requests.some(r=>r.state==='draft')) text='A proposal is waiting for the customer’s confirmation.';
  else if(snapshot.exchanges.length) {text='The confirmed exchange is saved in the store.';kind='good';}
  $('store-explanation').textContent=text;$('store-explanation').className=`store-explanation ${kind}`;
}
function renderChecks(show) {
  const checks=state.data.evidence.result?.checks||state.data.run.checks||{};
  $('eval-note').textContent=show?'Final checks against the saved store':'Finish the replay to reveal the final checks';
  $('checks').innerHTML=show?Object.entries(checks).map(([key,pass])=>`<div class="check ${pass?'':'fail'}"><span class="check-icon">${pass?'✓':'✕'}</span><div><div class="check-label">${esc(checkLabels[key]||key.replaceAll('_',' '))}</div><div class="check-result">EXPECTED TRUE · ACTUAL ${String(pass).toUpperCase()}</div></div></div>`).join(''):'<p class="muted">Evaluation appears at the end of the run.</p>';
}
function dialog(titleText,html) { $('dialog-title').textContent=titleText;$('dialog-content').innerHTML=html;$('detail-dialog').showModal(); }
function showTool(turn,index) {
  const tool=turns()[turn].toolResults[index].payload;
  dialog(tool.toolName,`<p>Recorded tool call · customer turn ${turn+1}</p><h3>Input</h3><pre>${esc(JSON.stringify(tool.args,null,2))}</pre><h3>Result</h3><pre>${esc(JSON.stringify(tool.result,null,2))}</pre><button id="tool-studio" class="primary-button">Inspect this turn in Studio ↗</button>`);
  $('tool-studio').onclick=()=>{$('detail-dialog').close();studio(turns()[turn].traceId);};
}
async function studio(traceId) {
  if(!state.data)return;
  // Reserve the tab during the click so the asynchronous check cannot block it.
  const traceTab=window.open('about:blank','_blank');
  if(traceTab)traceTab.opener=null;
  try {
    const trace=traceId||turns()[Math.min(1,turns().length-1)]?.traceId;
    notice('Checking the saved trace in Mastra Studio…');
    const data=await api('/api/studio',{run_id:state.selected,trace_id:trace});
    const mapped=Array.isArray(data.trace_urls)?data.trace_urls.find(t=>t.trace_id===trace)?.url:data.trace_urls?.[trace];
    const url=mapped||data.url;
    notice('');
    if(data.status==='ready'&&url) {
      if(traceTab&&!traceTab.closed)traceTab.location.replace(url);
      else window.location.assign(url);
    } else {
      if(traceTab&&!traceTab.closed)traceTab.close();
      dialog('Start the trace viewer',`<p>The recorded traces are ready. Start the local Studio viewer with this command, then check the connection.</p><pre id="studio-command">${esc(data.command||data.instructions||'See the README for the Studio launch command.')}</pre><button id="copy-command" class="primary-button">Copy command</button><button id="check-studio" class="text-button">Check Studio connection ↗</button><span id="copy-status" class="copy-status" aria-live="polite"></span>`);
      $('copy-command').onclick=async()=>{try{await navigator.clipboard.writeText($('studio-command').textContent);$('copy-status').textContent='Copied';}catch{$('copy-status').textContent='Select and copy the command above.';}};
      $('check-studio').onclick=()=>{$('detail-dialog').close();studio(trace);};
    }
  } catch(e) {
    if(traceTab&&!traceTab.closed)traceTab.close();
    notice(e.message,true);
  }
}
async function runScenario() {
  if(state.busy)return;setBusy(true);$('job').hidden=false;notice('');
  try {
    const {job_id}=await api('/api/runs',{scenario:$('scenario').value,variant:state.variant});
    $('job-title').textContent=`Running ${version(state.variant).toLowerCase()} · ${title($('scenario').value)}`;
    await pollJob(job_id);
  } catch(e) {notice(e.message,true);} finally {setBusy(false);$('job').hidden=true;}
}
function setBusy(busy) {state.busy=busy;$('run').disabled=busy;$('scenario').disabled=busy;document.querySelectorAll('[data-variant]').forEach(b=>b.disabled=busy);}
async function pollJob(id) {
  let lastProgress=-1;
  for(;;) {
    const job=await api(`/api/jobs/${encodeURIComponent(id)}`);
    const progress=job.progress?.at(-1);
    $('job-progress').textContent=progress?.message||progress?.text||`Status: ${job.status}`;
    if(job.run_id && job.progress?.length !== lastProgress && job.status==='running') {await loadRun(job.run_id);lastProgress=job.progress.length;}
    if(['complete','completed','succeeded','success'].includes(job.status)) {await refresh(job.run_id);notice('Run complete. The conversation and evaluation below are from this new run.');return;}
    if(['error','failed','cancelled'].includes(job.status)) throw new Error(job.error||'The run did not complete.');
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
}
async function chooseSelection() {
  const match=state.runs.find(r=>r.scenario===$('scenario').value&&r.variant===state.variant);
  if(match)await loadRun(match.id);
  else {state.selected=null;state.data=null;$('workspace').hidden=true;$('empty').hidden=false;renderList();}
}
$('scenario').onchange=()=>chooseSelection().catch(e=>notice(e.message,true));
document.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{setVariant(b.dataset.variant);chooseSelection().catch(e=>notice(e.message,true));});
$('refresh').onclick=()=>refresh(state.selected).catch(e=>notice(e.message,true));
$('run').onclick=runScenario;
$('replay').onclick=()=>{state.visible=1;state.selectedTurn=null;renderRun();};
$('next-turn').onclick=()=>{state.visible++;state.selectedTurn=null;renderRun();};
$('show-all').onclick=()=>{state.visible=Infinity;state.selectedTurn=null;renderRun();};
$('open-studio').onclick=()=>studio();
$('view-json').onclick=()=>window.open(`/api/runs/${encodeURIComponent(state.selected)}`,'_blank','noopener');
$('close-dialog').onclick=()=>$('detail-dialog').close();
$('detail-dialog').addEventListener('click',event=>{if(event.target===$('detail-dialog'))$('detail-dialog').close();});
refresh(new URLSearchParams(location.search).get('run')).catch(e=>notice(`Could not load runs: ${e.message}`,true));
