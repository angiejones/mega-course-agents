"""Separate execution and evaluation estimates; never price missing usage as zero."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent
PRICING = {
    'date': '2026-10-29',
    'jev': {'models': ['jev-1.13.0', 'jev-1.14.0'], 'inputPerMillion': .042, 'outputPerMillion': 0,
            'source': 'https://docs.typesafe.ai/models'},
    'agent': {'model': 'openai/gpt-6-luna', 'inputPerMillion': .10, 'cachedInputPerMillion': .01,
              'cacheWritePerMillion': .125, 'outputPerMillion': .50,
              'source': 'https://developers.openai.com/api/docs/pricing'},
}

def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0

def jev_cost(calls):
    if calls is None:
        return {'calls': None, 'inputTokens': None, 'outputTokens': None, 'usd': None}
    def tokens(key):
        values = [(c.get('usage') or {}).get(key) for c in calls]
        return sum(values) if all(number(v) for v in values) else None
    input_tokens, output_tokens = tokens('input_tokens'), tokens('output_tokens')
    known = all(c.get('status', 'completed') == 'completed' and c.get('model') in PRICING['jev']['models'] for c in calls)
    return {'calls': len(calls), 'inputTokens': input_tokens, 'outputTokens': output_tokens,
            'usd': input_tokens * .042 / 1e6 if known and input_tokens is not None else None}

def run_costs(evidence, scoring_rows):
    turns = evidence['events'][1:]
    model = evidence['events'][0]['runtime']['model']
    usd = 0
    for turn in turns:
        u = turn.get('usage') or {}
        values = [u.get('inputTokens'), u.get('outputTokens'), u.get('cachedInputTokens', 0), u.get('cacheCreationInputTokens', 0)]
        if model != PRICING['agent']['model'] or not all(number(v) for v in values):
            usd = None
            break
        inp, out, cached, written = values
        if cached + written > inp:
            usd = None
            break
        usd += ((inp-cached-written)*.10 + cached*.01 + written*.125 + out*.50)/1e6
    tracked = bool(turns) and all('jevCalls' in t for t in turns)
    classifier = jev_cost([c for t in turns for c in t['jevCalls']] if tracked else None)
    evaluation = jev_cost(scoring_rows) if scoring_rows else None
    total = usd + classifier['usd'] if usd is not None and classifier['usd'] is not None else None
    return {'execution': {'agentUsd': usd, 'jev': classifier, 'totalUsd': total}, 'evaluation': evaluation}

def load_scoring():
    path = ROOT/'reliability/scoring-results.json'
    rows = json.loads(path.read_text())['rows'] if path.exists() else []
    extra = ROOT/'reliability/cost-scoring-results.json'
    if extra.exists(): rows += json.loads(extra.read_text())['rows']
    return rows

def for_run(path, evidence, scoring_rows=None):
    rows = load_scoring() if scoring_rows is None else scoring_rows
    return run_costs(evidence, [r for r in rows if r.get('run') == path.name])
