/**
 * Regression tests for the Python pipeline integration.
 *
 * These cover the failure modes that previously turned a broken analysis run
 * into a real claim decision: a malformed payload scoring as zero confidence
 * (and so auto-rejecting), and a fallback that invented a damage percentage and
 * a payout figure.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  assertUsableResult,
  determineDecision,
  undeterminedDecision,
  readPipelinePayout,
  fallbackResult,
  runPipeline,
  PipelineError,
} = require('../src/services/python.service');

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test('assertUsableResult rejects a payload with no overall_assessment', () => {
  // A partial payload used to read as confidence 0, which auto-rejected the claim.
  assert.throws(() => assertUsableResult({ damage_percentage: 42 }), PipelineError);
});

test('assertUsableResult rejects a pipeline-reported error', () => {
  assert.throws(() => assertUsableResult({ error: 'No valid images could be processed' }), PipelineError);
});

test('assertUsableResult rejects an out-of-range confidence score', () => {
  assert.throws(
    () => assertUsableResult({ overall_assessment: { confidence_score: 7 } }),
    PipelineError
  );
  assert.throws(
    () => assertUsableResult({ overall_assessment: { confidence_score: 'high' } }),
    PipelineError
  );
});

test('assertUsableResult accepts a well-formed payload', () => {
  assert.strictEqual(assertUsableResult({ overall_assessment: { confidence_score: 0.82 } }), 0.82);
});

test('determineDecision sends an absent confidence score to manual review', () => {
  // Never auto-reject a claim just because the pipeline produced no verdict.
  for (const value of [undefined, null, NaN, 'n/a']) {
    const decision = determineDecision(value);
    assert.strictEqual(decision.status, 'manual_review', `value: ${String(value)}`);
    assert.strictEqual(decision.payout_approved, false);
  }
});

test('determineDecision honours a threshold configured as 0', async () => {
  // `parseFloat(env) || default` silently replaced a configured 0 with 0.7.
  await withEnv({ CLAIM_AUTO_APPROVE_THRESHOLD: '0', CLAIM_REJECT_THRESHOLD: '0' }, () => {
    assert.strictEqual(determineDecision(0).status, 'approved');
  });
});

test('determineDecision applies the default thresholds', async () => {
  await withEnv({ CLAIM_AUTO_APPROVE_THRESHOLD: undefined, CLAIM_REJECT_THRESHOLD: undefined }, () => {
    assert.strictEqual(determineDecision(0.9).status, 'approved');
    assert.strictEqual(determineDecision(0.5).status, 'manual_review');
    assert.strictEqual(determineDecision(0.1).status, 'rejected');
  });
});

test('readPipelinePayout reads the only key the pipeline emits', () => {
  // main_pipeline.py emits `payout_amount`; the backend read `final_payout_amount`,
  // so every approved claim was persisted with a payout of 0.
  assert.strictEqual(readPipelinePayout({ payout_calculation: { payout_amount: 42500 } }), 42500);
  assert.strictEqual(readPipelinePayout({ payout_calculation: { final_payout_amount: 999 } }), 0);
  assert.strictEqual(readPipelinePayout({}), 0);
  assert.strictEqual(readPipelinePayout({ payout_calculation: { payout_amount: 'lots' } }), 0);
});

test('fallbackResult invents no damage figure and no payout', () => {
  const result = fallbackResult('pipeline crashed', 'exit_code');

  assert.strictEqual(result.pipeline_failed, true);
  assert.strictEqual(result.overall_assessment.confidence_score, null);
  assert.strictEqual(result.overall_assessment.manual_review_required, true);
  assert.strictEqual(result.damage_assessment.ai_calculated_damage_percent, null);
  assert.strictEqual(result.damage_assessment.final_damage_percent, null);
  assert.strictEqual(readPipelinePayout(result), 0);
});

test('a failed pipeline run never produces an automatic approval or rejection', () => {
  const result = fallbackResult('pipeline crashed', 'exit_code');
  const decision = determineDecision(result.overall_assessment.confidence_score);

  assert.strictEqual(decision.status, 'manual_review');
  assert.strictEqual(decision.payout_approved, false);
});

test('undeterminedDecision always routes to manual review', () => {
  const decision = undeterminedDecision('timeout');
  assert.strictEqual(decision.status, 'manual_review');
  assert.strictEqual(decision.manual_review_required, true);
  assert.strictEqual(decision.payout_approved, false);
});

test('runPipeline rejects rather than running with no images', async () => {
  await assert.rejects(() => runPipeline([]), PipelineError);
});

test('runPipeline refuses an image path that would parse as a CLI flag', async () => {
  await assert.rejects(() => runPipeline(['--sum-insured']), (err) => {
    assert.ok(err instanceof PipelineError);
    assert.strictEqual(err.stage, 'no_input');
    return true;
  });
});
