const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PIPELINE_PATH = path.join(__dirname, '..', '..', '..', 'cropfarmPY', 'main_pipeline.py');
const PIPELINE_CWD = path.join(__dirname, '..', '..', '..', 'cropfarmPY');
const PYTHON_CMD = process.env.PYTHON_COMMAND || 'python';
const TIMEOUT_MS = readPositiveInt(process.env.PYTHON_PIPELINE_TIMEOUT_MS, 120_000);
const KILL_GRACE_MS = 5_000;
const MAX_STREAM_BYTES = 10 * 1024 * 1024;

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Read a threshold from the environment. Uses Number (not parseFloat ||) so a
 * configured 0 is honoured instead of falling back to the default.
 */
function readThreshold(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Raised when the pipeline could not produce a usable assessment. Carries the
 * stage that failed so the claim flow can report it instead of guessing.
 */
class PipelineError extends Error {
  constructor(message, stage) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

/**
 * Check if the Python pipeline script is available.
 */
const isPipelineAvailable = () => fs.existsSync(PIPELINE_PATH);

/**
 * Validate that a pipeline payload carries the fields the claim decision is
 * built from. A partially-written or renamed payload must not be treated as a
 * successful assessment, because a missing confidence score reads as 0 and
 * would auto-reject a legitimate claim.
 *
 * @throws {PipelineError}
 */
const assertUsableResult = (result) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new PipelineError('Pipeline returned a non-object result', 'output_shape');
  }
  // The pipeline reports its own failures in an `error` field.
  if (result.error) {
    throw new PipelineError(`Pipeline reported an error: ${result.error}`, 'pipeline_error');
  }

  const assessment = result.overall_assessment;
  if (!assessment || typeof assessment !== 'object') {
    throw new PipelineError('Pipeline result is missing overall_assessment', 'output_shape');
  }

  const confidence = Number(assessment.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new PipelineError(
      `Pipeline returned an out-of-range confidence_score: ${assessment.confidence_score}`,
      'output_shape'
    );
  }

  return confidence;
};

/**
 * Read the payout the pipeline calculated. `payout_amount` is the only key
 * main_pipeline.py emits.
 */
const readPipelinePayout = (result) => {
  const amount = Number(result?.payout_calculation?.payout_amount);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

/**
 * Run the crop-damage analysis pipeline.
 *
 * @param {string[]} imagePaths   – absolute paths to uploaded images
 * @param {object}   opts
 * @param {number}   opts.userLat
 * @param {number}   opts.userLon
 * @param {number}   opts.fieldSize      – known field m², omitted when unknown
 *                                         so the pipeline estimates it itself
 * @param {number}   opts.sumInsured
 * @returns {Promise<object>}  parsed JSON from Python stdout
 * @throws  {PipelineError}
 */
const runPipeline = (imagePaths, opts = {}) => {
  return new Promise((resolve, reject) => {
    if (!isPipelineAvailable()) {
      return reject(new PipelineError(`Python pipeline not found at ${PIPELINE_PATH}`, 'not_found'));
    }
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return reject(new PipelineError('No images available for analysis', 'no_input'));
    }

    // Guard against a path being parsed as a flag by the pipeline's argument loop.
    const badPath = imagePaths.find((p) => typeof p !== 'string' || p.startsWith('-'));
    if (badPath !== undefined) {
      return reject(new PipelineError(`Refusing to pass unsafe image path: ${badPath}`, 'no_input'));
    }

    const args = [PIPELINE_PATH, ...imagePaths];

    if (Number.isFinite(opts.fieldSize) && opts.fieldSize > 0) {
      args.push('--field-size', String(opts.fieldSize));
    }
    if (Number.isFinite(opts.sumInsured) && opts.sumInsured > 0) {
      args.push('--sum-insured', String(opts.sumInsured));
    }
    if (Number.isFinite(opts.userLat) && Number.isFinite(opts.userLon)) {
      args.push('--user-lat', String(opts.userLat), '--user-lon', String(opts.userLon));
    }
    if (process.env.WEATHER_API_KEY) {
      args.push('--api-key', process.env.WEATHER_API_KEY);
    }

    const py = spawn(PYTHON_CMD, args, { cwd: PIPELINE_CWD, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer = null;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      fn(value);
    };

    const timer = setTimeout(() => {
      py.kill('SIGTERM');
      // SIGTERM can be ignored by a wedged interpreter; make sure it goes away.
      killTimer = setTimeout(() => py.kill('SIGKILL'), KILL_GRACE_MS);
      settle(reject, new PipelineError(`Pipeline timed out after ${TIMEOUT_MS} ms`, 'timeout'));
    }, TIMEOUT_MS);

    py.stdout.on('data', (d) => {
      if (stdout.length < MAX_STREAM_BYTES) stdout += d.toString();
    });
    py.stderr.on('data', (d) => {
      if (stderr.length < MAX_STREAM_BYTES) stderr += d.toString();
    });

    py.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim().split('\n').slice(-5).join(' | ') || '(no stderr output)';
        return settle(reject, new PipelineError(`Pipeline exited with code ${code}: ${detail}`, 'exit_code'));
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        return settle(reject, new PipelineError(`Pipeline produced invalid JSON: ${e.message}`, 'invalid_json'));
      }

      try {
        assertUsableResult(parsed);
      } catch (e) {
        return settle(reject, e);
      }

      settle(resolve, parsed);
    });

    py.on('error', (err) => {
      settle(reject, new PipelineError(`Failed to start Python (${PYTHON_CMD}): ${err.message}`, 'spawn'));
    });
  });
};

/**
 * Result placeholder for a pipeline run that did not produce an assessment.
 *
 * It deliberately carries no damage percentage and no payout figure: inventing
 * numbers here would put fabricated values in front of an adjuster and, worse,
 * make a total pipeline failure look like a completed assessment.
 */
const fallbackResult = (reason = 'Pipeline unavailable', stage = 'unknown') => ({
  claim_id: `UNPROCESSED_${Date.now()}`,
  processing_timestamp: new Date().toISOString(),
  pipeline_failed: true,
  pipeline_failure_stage: stage,
  pipeline_failure_reason: reason,
  overall_assessment: {
    final_decision: 'MANUAL_REVIEW',
    confidence_score: null,
    risk_level: 'unknown',
    manual_review_required: true,
    decision_reason: `Automated analysis did not complete (${reason}). Manual review required.`,
  },
  damage_assessment: {
    ai_calculated_damage_percent: null,
    final_damage_percent: null,
    severity: 'unknown',
  },
  payout_calculation: {
    payout_amount: 0,
    currency: 'INR',
    note: 'No payout calculated: automated analysis did not complete.',
  },
  verification_results: {},
  verification_evidence: {
    authenticity_verified: false,
    location_verified: false,
    weather_verified: false,
    processing_note: reason,
  },
});

/**
 * Decision for a claim whose automated analysis did not complete.
 * Always manual review: an incomplete assessment is not evidence for or against
 * a claim, so it must neither approve a payout nor reject a farmer.
 */
const undeterminedDecision = (reason) => ({
  decision: 'MANUAL_REVIEW',
  status: 'manual_review',
  risk: 'unknown',
  manual_review_required: true,
  payout_approved: false,
  reason: `Automated analysis did not complete (${reason}). A reviewer will assess this claim.`,
});

/**
 * Determine claim decision based on confidence score.
 * Thresholds are configurable via .env:
 *   CLAIM_AUTO_APPROVE_THRESHOLD (default: 0.7)
 *   CLAIM_REJECT_THRESHOLD (default: 0.3)
 *
 * A non-numeric confidence means the pipeline gave no usable verdict, so the
 * claim goes to manual review rather than being scored as zero-confidence.
 */
const determineDecision = (confidence) => {
  // Number(null) and Number('') are both 0, which would read as a
  // zero-confidence assessment and reject the claim. Only an actual number
  // counts as a verdict.
  const score = typeof confidence === 'number' ? confidence : Number.NaN;
  if (!Number.isFinite(score)) {
    return undeterminedDecision('no confidence score was produced');
  }

  const approveThreshold = readThreshold(process.env.CLAIM_AUTO_APPROVE_THRESHOLD, 0.7);
  const rejectThreshold = readThreshold(process.env.CLAIM_REJECT_THRESHOLD, 0.3);

  if (score >= approveThreshold) {
    return {
      decision: 'APPROVE',
      status: 'approved',
      risk: 'low',
      manual_review_required: false,
      payout_approved: true,
      reason: `High confidence (${(score * 100).toFixed(1)}%) - claim approved for payout`,
    };
  }
  if (score >= rejectThreshold) {
    return {
      decision: 'MANUAL_REVIEW',
      status: 'manual_review',
      risk: 'medium',
      manual_review_required: true,
      payout_approved: false,
      reason: `Moderate confidence (${(score * 100).toFixed(1)}%) - requires manual verification`,
    };
  }
  return {
    decision: 'REJECT',
    status: 'rejected',
    risk: 'high',
    manual_review_required: false,
    payout_approved: false,
    reason: `Low confidence (${(score * 100).toFixed(1)}%) - insufficient evidence`,
  };
};

module.exports = {
  isPipelineAvailable,
  runPipeline,
  fallbackResult,
  determineDecision,
  undeterminedDecision,
  readPipelinePayout,
  assertUsableResult,
  PipelineError,
  PIPELINE_PATH,
};
