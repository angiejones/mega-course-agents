# Evaluate the retail agent

This directory contains the OpenEnv harness, response scorer, guardrail and security checks, comparison tools, and local dashboard used in Chapter 5. It runs the same retail agent as Studio, with a fresh fictional store and conversation for each run. It does not connect to production stores or the external supplier and carrier services.

## Setup

Complete the repository's Node setup and configure your own `.env.local` first. Use Python 3.12 and Node 22.23.3 or newer within the Node 22 series.

From the repository root:

```sh
python3.12 -m venv evaluations/.venv
source evaluations/.venv/bin/activate
python -m pip install -r evaluations/requirements.txt
python evaluations/setup.py
npm run typecheck:reliability
npm run test:reliability
python -m unittest discover -s evaluations/reliability -p 'test_*.py'
cd evaluations
```

The remaining commands run from `evaluations/`, with the virtual environment active. Model evaluations make paid calls using your OpenAI and TypeSafe keys. Unit tests do not.

Setup creates an ignored `.baseline/` copy of the agent with the original exchange tool. The current agent uses the source at the repository root. Both versions use the same guardrails and models so the comparison isolates the exchange tool change. Rebuild `.baseline/` after unrelated agent changes if you want another matched comparison. Never edit the original baseline fixture to make an eval pass.

## Run a customer conversation

```sh
python run.py --scenario standard --variant fixed --label normal
python run.py --scenario late_defect --variant baseline --label before
python run.py --scenario late_defect --variant fixed --label after
```

A failed eval exits with status 1 and preserves its evidence. A baseline defect failure is expected, but inspect the actual checks. Model behavior can vary. Each result directory contains the messages, tool calls, store snapshots, checks, usage, and trace database. Keep failures as well as passes.

Start the dashboard in a separate terminal:

```sh
source evaluations/.venv/bin/activate
python evaluations/server.py
```

Open http://127.0.0.1:8768. Select a saved run to inspect its conversation and store state. The **Run scenario** button makes new model calls. The evaluation tabs replay saved results.

## Compare repeated runs and costs

```sh
python reliability/record-cost-comparison.py
python reliability/compare.py
./node reliability/score-costs.ts
python reliability/publish.py
```

The recorder saves 3 matched baseline/current pairs and retains every outcome. Execution cost includes the retail model and Jev classification; evaluation cost covers the subsequent response scoring. The rates in `costs.py` are dated estimates, not your invoice. Update them for your provider and model; unsupported usage stays unpriced.

## Review a rubric and score responses

```sh
python reliability/prepare-scoring.py
```

Open `reliability/scoring-samples.json`. Review each response against the customer messages, store, tool results, and rubric in `reliability/response-scorer.ts`. Fill in the `expected` array in criterion order: groundedness, then next step. Use `pass`, `fail`, or `insufficient`. Assign your labels before asking Jev so agreement is a comparison with your review, not labels copied from the judge.

```sh
./node reliability/score.ts
python reliability/publish.py
```

The scorer validates the answer structure and model, then reports agreement with your labels. Disagreement exits with status 1 and saves the judgments for review. The dashboard shows the fraction of criteria passed as a percentage; insufficient evidence leaves it unscored. Confidence is separate from the score.

## Check guardrails

```sh
python reliability/verify-guardrails.py
```

The checks cover blocked full card numbers, allowed lookups and last-four digits, private staff contact replacement, and ordinary text. They inspect the actual processors attached to the retail agent. The unit tests also check that customer and official support addresses remain unchanged.

To inspect the model's original draft, start the trace viewer in another terminal after recording runs:

```sh
source evaluations/.venv/bin/activate
python evaluations/studio.py
```

Then, back in `evaluations/`:

```sh
python reliability/capture-trace.py
python reliability/verify-traces.py
python reliability/publish.py
```

The viewer copies saved spans into its own database. It does not modify the run's database. If an existing local viewer uses port 4178, stop it before starting this one. Stop either server with Control+C. Keep these local services private.

## Check prompt injection

```sh
python reliability/verify-security.py
python reliability/publish.py
```

These cases request other customers' private data and try to override the signed-in identity. An allowed own-order request acts as a control. Code checks the fictional private records and store state; Jev evaluates the refusal. The fixture contains order data, not a customer-address directory. A passing run is evidence for those requests, not a guarantee against every attack or model change.

Generated results, databases, baseline copies, and keys are ignored by Git. Re-running a scorer can replace its summary file, so copy summaries you want to compare before rerunning. Individual conversations have unique result directories.
