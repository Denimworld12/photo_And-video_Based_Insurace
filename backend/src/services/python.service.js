const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PIPELINE_PATH = path.join(__dirname, '..', '..', '..', 'cropfarmPY', 'main_pipeline.py');
const PIPELINE_CWD = path.join(__dirname, '..', '..', '..', 'cropfarmPY');
const PYTHON_CMD = process.env.PYTHON_COMMAND || 'python';
const TIMEOUT_MS = 60_000;

/**
 * Check if the Python pipeline script is available.
 */
const isPipelineAvailable = () => fs.existsSync(PIPELINE_PATH);

/**
 * Run the crop-damage analysis pipeline.
 *
 * @param {string[]} imagePaths   – absolute paths to uploaded images
 * @param {object}   opts
 * @param {number}   opts.userLat
 * @param {number}   opts.userLon
 * @param {number}   opts.fieldSize      – estimated field m²
 * @param {number}   opts.sumInsured
 * @param {number}   opts.claimedDamage  – percentage
 * @returns {Promise<object>}  parsed JSON from Python stdout
 */
const runPipeline = (imagePaths, opts = {}) => {
  return new Promise((resolve, reject) => {
    if (!isPipelineAvailable()) {
      return reject(new Error('Python pipeline not found'));
    }

    const args = [
      PIPELINE_PATH,
      ...imagePaths,
      '--field-size', String(opts.fieldSize || imagePaths.length * 1500),
      '--sum-insured', String(opts.sumInsured || 100000),
      '--claimed-damage', String(opts.claimedDamage || 50),
    ];

    if (opts.userLat != null && opts.userLon != null) {
      args.push('--user-lat', String(opts.userLat), '--user-lon', String(opts.userLon));
    }
    if (process.env.WEATHER_API_KEY) {
      args.push('--api-key', process.env.WEATHER_API_KEY);
    }

    const py = spawn(PYTHON_CMD, args, { cwd: PIPELINE_CWD, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      py.kill();
      reject(new Error('Python pipeline timeout (60 s)'));
    }, TIMEOUT_MS);

    py.stdout.on('data', (d) => (stdout += d.toString()));
    py.stderr.on('data', (d) => (stderr += d.toString()));

    py.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Python exited with code ${code}: ${stderr}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Invalid JSON from Python: ${e.message}`));
      }
    });

    py.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
};

/**
 * Generate a fallback result when the Python pipeline is unavailable.
 */
const fallbackResult = (reason = 'Pipeline unavailable') => ({
  claim_id: `FALLBACK_${Date.now()}`,
  processing_timestamp: new Date().toISOString(),
  overall_assessment: {
    final_decision: 'MANUAL_REVIEW',
    confidence_score: 0.3,
    risk_level: 'medium',
    manual_review_required: true,
    decision_reason: reason,
  },
  damage_assessment: {
    ai_calculated_damage_percent: 35,
    farmer_claimed_damage_percent: 50,
    final_damage_percent: 42.5,
    severity: 'moderate',
  },
  payout_calculation: {
    sum_insured: 100000,
    damage_percent: 42.5,
    final_payout_amount: 42500,
    currency: 'INR',
  },
  verification_evidence: {
    authenticity_verified: false,
    location_verified: false,
    processing_note: reason,
  },
});

/**
 * Determine claim decision based on confidence score.
 * Thresholds are configurable via .env:
 *   CLAIM_AUTO_APPROVE_THRESHOLD (default: 0.7)
 *   CLAIM_REJECT_THRESHOLD (default: 0.3)
 */
const determineDecision = (confidence) => {
  const approveThreshold = parseFloat(process.env.CLAIM_AUTO_APPROVE_THRESHOLD) || 0.7;
  const rejectThreshold = parseFloat(process.env.CLAIM_REJECT_THRESHOLD) || 0.3;

  if (confidence >= approveThreshold) {
    return {
      decision: 'APPROVE',
      status: 'approved',
      risk: 'low',
      manual_review_required: false,
      payout_approved: true,
      reason: `High confidence (${(confidence * 100).toFixed(1)}%) – claim approved for payout`,
    };
  }
  if (confidence >= rejectThreshold) {
    return {
      decision: 'MANUAL_REVIEW',
      status: 'manual_review',
      risk: 'medium',
      manual_review_required: true,
      payout_approved: false,
      reason: `Moderate confidence (${(confidence * 100).toFixed(1)}%) – requires manual verification`,
    };
  }
  return {
    decision: 'REJECT',
    status: 'rejected',
    risk: 'high',
    manual_review_required: false,
    payout_approved: false,
    reason: `Low confidence (${(confidence * 100).toFixed(1)}%) – insufficient evidence`,
  };
};

module.exports = { isPipelineAvailable, runPipeline, fallbackResult, determineDecision };
