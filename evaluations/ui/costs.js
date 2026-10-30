window.costMoney = value => value == null ? '—' : '$' + value.toFixed(6);
window.costJev = value => value == null ? 'Not evaluated' : `${value.calls} ${value.calls === 1 ? 'call' : 'calls'} · ${costMoney(value.usd)}`;
window.costBreakdown = c => !c ? '' : `
${c.execution.totalUsd == null ? '' : `<div class="result-line"><span>Execution cost</span><strong>${costMoney(c.execution.totalUsd)}</strong></div>`}
${c.evaluation ? `<div class="result-line"><span>Evaluation cost</span><strong>${costMoney(c.evaluation.usd)}</strong></div>` : ''}
<details><summary>Cost breakdown</summary><div class="result-line"><span>Retail model estimate</span><strong>${costMoney(c.execution.agentUsd)}</strong></div>
${c.execution.jev.usd == null ? '' : `<div class="result-line"><span>Jev classifier</span><strong>${costJev(c.execution.jev)}</strong></div>`}
${c.evaluation ? `<div class="result-line"><span>Jev response scorer</span><strong>${costJev(c.evaluation)}</strong></div>` : ''}</details>`;
