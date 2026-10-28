import assert from "node:assert/strict";
import test from "node:test";
import { interpretProductDecision } from "./product-decision.ts";

function response(choice: string, confidence = 0.95) {
  return {
    model: "test-model",
    answers: {
      style: {
        type: "choice",
        choice: "supported",
        confidence: 1,
        probabilities: { supported: 1, contradicted: 0, unknown: 0 },
      },
      color: {
        type: "choice",
        choice: "supported",
        confidence: 1,
        probabilities: { supported: 1, contradicted: 0, unknown: 0 },
      },
      cushioning: {
        type: "choice",
        choice: "unknown",
        confidence: 1,
        probabilities: { supported: 0, contradicted: 0, unknown: 1 },
      },
      match: {
        type: "choice",
        choice,
        confidence,
        probabilities: Object.fromEntries(
          ["strong_match", "alternative", "poor_match", "insufficient"].map(
            (label) => [label, label === choice ? 1 : 0],
          ),
        ),
      },
    },
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("Only sufficiently confident plausible matches can reach proposal", () => {
  for (const choice of ["strong_match", "alternative"]) {
    const result = interpretProductDecision(response(choice), "test-model");
    assert.equal(result.assessment.suitable, true);
    assert.equal(result.decision.needsReview, false);
    assert.equal(result.tokens, 120);
  }
  for (const choice of ["poor_match", "insufficient"]) {
    assert.equal(
      interpretProductDecision(response(choice), "test-model").assessment
        .suitable,
      false,
    );
  }
  const uncertain = interpretProductDecision(
    response("strong_match", 0.79),
    "test-model",
  );
  assert.equal(uncertain.assessment.suitable, false);
  assert.equal(uncertain.decision.needsReview, true);
  assert.ok(uncertain.assessment.missingInformation.length);
});

test("Unknown preference evidence is not rewritten as a product fact", () => {
  const result = interpretProductDecision(
    response("alternative"),
    "test-model",
  );
  assert.match(result.assessment.tradeoffs.join(" "), /information is missing/);
  assert.equal(result.decision.choice, "alternative");
  assert.doesNotMatch(
    JSON.stringify(result.assessment),
    /cushioned|black|leather/,
  );
});

test("Malformed or wrong-model decisions fail closed", () => {
  assert.throws(() =>
    interpretProductDecision(response("other"), "test-model"),
  );
  assert.throws(() =>
    interpretProductDecision(response("strong_match"), "wrong"),
  );
  const invalid = response("strong_match");
  invalid.answers.match.probabilities.alternative = 0.5;
  assert.throws(() => interpretProductDecision(invalid, "test-model"));
  const wrongChoice = response("strong_match");
  wrongChoice.answers.match.probabilities = {
    strong_match: 0.1,
    alternative: 0.9,
    poor_match: 0,
    insufficient: 0,
  };
  assert.throws(() => interpretProductDecision(wrongChoice, "test-model"));
});

test("Missing token usage stays explicitly incomplete", () => {
  const raw = response("strong_match");
  const result = interpretProductDecision(
    {
      ...raw,
      usage: { input_tokens: null, output_tokens: 20 },
    },
    "test-model",
  );
  assert.equal(result.tokens, 20);
  assert.equal(result.usageComplete, false);
});
