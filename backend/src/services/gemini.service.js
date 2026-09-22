/**
 * Gemini AI Service – Crop Insurance Claim Summarization
 * ======================================================
 * Uses Google Gemini to generate human-readable summaries
 * of crop damage assessment results.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (API_KEY && API_KEY !== 'your_gemini_api_key_here') {
  try {
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[GEMINI] Service initialized');
  } catch (err) {
    console.warn('[GEMINI] Initialization failed:', err.message);
  }
} else {
  console.log('[GEMINI] Not configured (set GEMINI_API_KEY in .env), summaries will use the built-in fallback');
}

/**
 * Check if Gemini is available
 */
const isAvailable = () => model !== null;

/**
 * Generate a plain-language summary of claim processing results.
 *
 * @param {object} processingResult – the full processing result from Python pipeline
 * @param {object} claimInfo        – basic claim metadata (documentId, cropType, farmArea, etc.)
 * @returns {Promise<object>}       – { summary, recommendations, riskFactors }
 */
const summarizeClaimResult = async (processingResult, claimInfo = {}) => {
  if (!model) {
    return fallbackSummary(processingResult, claimInfo);
  }

  const prompt = buildPrompt(processingResult, claimInfo);

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Try to parse structured JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || text,
          recommendations: parsed.recommendations || [],
          riskFactors: parsed.riskFactors || parsed.risk_factors || [],
          keyFindings: parsed.keyFindings || parsed.key_findings || [],
          payoutJustification: parsed.payoutJustification || parsed.payout_justification || '',
          generatedBy: 'gemini-1.5-flash',
          generatedAt: new Date().toISOString(),
        };
      } catch { /* fallthrough to plain text */ }
    }

    return {
      summary: text.trim(),
      recommendations: [],
      riskFactors: [],
      keyFindings: [],
      payoutJustification: '',
      generatedBy: 'gemini-1.5-flash',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[GEMINI] Summarization failed, using fallback summary:', err.message);
    return fallbackSummary(processingResult, claimInfo);
  }
};

/**
 * Analyze a crop damage image using Gemini Vision.
 *
 * @param {string} imagePath – absolute path to the image file
 * @param {object} context   – optional context (cropType, season, etc.)
 * @returns {Promise<object>} – { description, damageEstimate, cropHealth, confidence }
 */
const analyzeImage = async (imagePath, context = {}) => {
  if (!model) {
    return { description: 'AI image analysis unavailable', damageEstimate: null, confidence: 0 };
  }

  try {
    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await visionModel.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      `You are an expert crop damage assessor for agricultural insurance.
Analyze this crop image and provide a JSON response:
{
  "description": "Brief description of what you see",
  "cropHealth": "healthy | stressed | damaged | severely_damaged | dead",
  "damageEstimate": <number 0-100>,
  "damageType": "drought | flood | pest | disease | hail | healthy | unknown",
  "confidence": <number 0.0-1.0>,
  "observations": ["observation1", "observation2"]
}
${context.cropType ? `Crop type: ${context.cropType}` : ''}
${context.season ? `Season: ${context.season}` : ''}
Respond with ONLY the JSON object.`,
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return { ...JSON.parse(jsonMatch[0]), analyzedBy: 'gemini-1.5-flash' }; } catch { /* fallthrough */ }
    }

    return { description: text.trim(), damageEstimate: null, confidence: 0.5, analyzedBy: 'gemini-1.5-flash' };
  } catch (err) {
    console.error('[GEMINI] Image analysis failed:', err.message);
    return { description: 'Image analysis failed', damageEstimate: null, confidence: 0, error: err.message };
  }
};

/* ─── Internal helpers ─── */

/** Format a rupee amount, tolerating a missing or non-numeric value. */
function rupees(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : 'not calculated';
}

/** Show a percentage, or say so plainly when none was measured. */
function percent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n}%` : 'not measured';
}

function buildPrompt(pr, info) {
  const damage = pr.damage_assessment || {};
  const payout = pr.payout_calculation || {};
  const overall = pr.overall_assessment || {};
  const verification = pr.verification_evidence || pr.verification_results || {};
  const decision = pr.decision || {};

  return `You are an agricultural insurance claim analyst for the Indian Pradhan Mantri Fasal Bima Yojana (PMFBY) scheme. 
Analyze the following crop damage assessment data and provide a clear, professional summary.

CLAIM INFORMATION:
- Document ID: ${info.documentId || 'N/A'}
- Crop Type: ${info.cropType || 'Unknown'}
- Farm Area: ${info.farmArea || 'Unknown'} hectares
- Loss Reason Reported: ${info.lossReason || 'Unknown'}
- Season: ${info.season || 'Not specified'}
- State: ${info.state || 'Not specified'}

DAMAGE ASSESSMENT:
- AI Calculated Damage: ${percent(damage.ai_calculated_damage_percent ?? damage.final_damage_percent)}
- Final Damage Percentage: ${percent(damage.final_damage_percent)}
- Severity: ${damage.severity || 'Unknown'}

VERIFICATION RESULTS:
- Authenticity: ${verification.authenticity_verified ? 'PASSED' : 'FAILED/UNKNOWN'}
- Location: ${verification.location_verified ? 'PASSED' : 'FAILED/UNKNOWN'}
- Weather Corroboration: ${verification.weather_verified ? 'MATCH' : 'NO MATCH/UNKNOWN'}

DECISION:
- Status: ${decision.status || overall.final_decision || 'Pending'}
- Confidence Score: ${overall.confidence_score ?? 'not produced'}
- Reason: ${decision.reason || overall.decision_reason || 'N/A'}
${pr.pipeline_failed ? '- NOTE: automated analysis did not complete; no damage measurement is available and this claim needs a human reviewer.' : ''}

PAYOUT:
- Sum Insured: INR ${rupees(payout.sum_insured)}
- Calculated Payout: INR ${rupees(payout.payout_amount)}

Respond with a JSON object:
{
  "summary": "A 2-3 sentence professional summary of the claim assessment",
  "keyFindings": ["finding1", "finding2", "finding3"],
  "riskFactors": ["risk1", "risk2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "payoutJustification": "Brief justification for the payout amount"
}
Respond with ONLY the JSON object.`;
}

function fallbackSummary(pr, info) {
  const damage = pr.damage_assessment || {};
  const decision = pr.decision || {};
  const overall = pr.overall_assessment || {};
  const payout = pr.payout_calculation || {};
  const confidence = Number(overall.confidence_score);
  const damagePercent = Number(damage.final_damage_percent ?? damage.ai_calculated_damage_percent);
  const status = decision.status || overall.final_decision || 'pending';
  const hasDamageMeasurement = Number.isFinite(damagePercent);

  // A claim whose analysis never completed must not be summarised as "0% damage
  // detected" - that reads as a measurement, when in fact nothing was measured.
  if (pr.pipeline_failed || !hasDamageMeasurement) {
    const reason = pr.pipeline_failure_reason || 'the automated assessment did not complete';
    return {
      summary:
        `Claim ${info.documentId || ''} for ${info.cropType || 'crop'} damage could not be assessed automatically ` +
        `(${reason}). No damage measurement or payout figure is available; a reviewer must assess this claim.`,
      keyFindings: [
        'Automated damage assessment did not complete',
        `Reason: ${reason}`,
        `Status: ${status}`,
      ],
      riskFactors: ['No automated verification evidence is available for this claim'],
      recommendations: ['Manual field inspection required'],
      payoutJustification: 'No payout calculated: the automated assessment did not complete.',
      generatedBy: 'fallback',
      generatedAt: new Date().toISOString(),
    };
  }

  let summary = `Claim ${info.documentId || ''} for ${info.cropType || 'crop'} damage has been assessed with ${Math.round(damagePercent)}% damage detected. `;
  if (status === 'approved') {
    summary += `The claim has been approved with a payout of INR ${rupees(payout.payout_amount)}.`;
  } else if (status === 'rejected') {
    summary += `The claim has been rejected. ${decision.reason || ''}`;
  } else {
    summary += Number.isFinite(confidence)
      ? `The claim requires manual review (confidence: ${(confidence * 100).toFixed(0)}%).`
      : 'The claim requires manual review.';
  }

  return {
    summary,
    keyFindings: [
      `Damage level: ${damagePercent}% (${damage.severity || 'unknown severity'})`,
      Number.isFinite(confidence) ? `Confidence score: ${(confidence * 100).toFixed(0)}%` : 'Confidence score: not produced',
      `Status: ${status}`,
    ],
    riskFactors: Number.isFinite(confidence) && confidence < 0.5 ? ['Low confidence score may indicate uncertain assessment'] : [],
    recommendations: status === 'manual_review' ? ['Manual field inspection recommended'] : [],
    payoutJustification: Number(payout.payout_amount) > 0
      ? `Based on ${damagePercent}% verified damage on INR ${rupees(payout.sum_insured)} sum insured`
      : 'No payout calculated',
    generatedBy: 'fallback',
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { isAvailable, summarizeClaimResult, analyzeImage };
