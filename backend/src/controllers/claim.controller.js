const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const Notification = require('../models/Notification');
const { uploadClaimImage } = require('../services/cloudinary.service');
const {
  runPipeline,
  fallbackResult,
  determineDecision,
  undeterminedDecision,
  readPipelinePayout,
  isPipelineAvailable,
} = require('../services/python.service');
const { summarizeClaimResult, isAvailable: isGeminiAvailable } = require('../services/gemini.service');

// In-memory fallback for running without a database (development only). Entries
// are keyed by documentId and always carry their owner, so the same ownership
// rules apply whether a claim came from the database or from here.
const claimCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const isDbConnected = () => mongoose.connection.readyState === 1;

/* ─── helpers ─── */

const pruneCache = () => {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [key, entry] of claimCache) {
    if (new Date(entry.createdAt || 0).getTime() < cutoff) claimCache.delete(key);
  }
};

const saveToCache = (docId, data) => {
  pruneCache();
  claimCache.set(docId, data);
};
const getFromCache = (docId) => claimCache.get(docId);

const generateDocumentId = () => {
  const ts = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 90 + 10);
  const letters = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `CLM-${ts}${rnd}-${letters}`;
};

const isOwner = (claim, user) => {
  const ownerId = claim?.userId?._id?.toString() || claim?.userId?.toString();
  return Boolean(ownerId) && ownerId === user._id.toString();
};

const canAccess = (claim, user) => user.role === 'admin' || isOwner(claim, user);

/**
 * Load a claim by documentId and enforce access.
 * Returns { claim } or { error: { status, body } } so callers respond uniformly.
 * "Not owned" is reported as 404, so the endpoint cannot be used to probe which
 * document IDs exist.
 */
const loadAccessibleClaim = async (documentId, user) => {
  let claim = null;

  if (isDbConnected()) {
    claim = await Claim.findOne({ documentId });
  } else {
    claim = getFromCache(documentId) || null;
  }

  if (!claim || !canAccess(claim, user)) {
    return { error: { status: 404, body: { success: false, error: 'Claim not found' } } };
  }
  return { claim };
};

/** Remove a temporary upload that will not be attached to any claim. */
const discardUpload = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`[CLAIM] Failed to remove local file ${filePath}:`, err.message);
    }
  });
};

/**
 * Sum insured for a claim, taken from the policy it was filed against.
 * Falls back to DEFAULT_SUM_INSURED (100000) when the policy cannot be
 * resolved, and says so in the log, because a silently wrong sum insured
 * scales the payout.
 */
const resolveSumInsured = async (claim) => {
  const fallback = Number(process.env.DEFAULT_SUM_INSURED) || 100000;
  const reference = claim.policyId || claim.insuranceId;
  if (!reference || !isDbConnected()) return { sumInsured: fallback, source: 'default' };

  try {
    const query = mongoose.isValidObjectId(reference)
      ? { _id: reference }
      : { code: String(reference).toUpperCase() };
    const policy = await Policy.findOne(query);
    if (!policy || !policy.schemes?.length) {
      console.warn(`[CLAIM] No policy matched "${reference}", using default sum insured ${fallback}`);
      return { sumInsured: fallback, source: 'default' };
    }

    const scheme =
      policy.schemes.find((s) => s.code === claim.scheme || s.name === claim.scheme) || policy.schemes[0];
    const maxAmount = Number(scheme?.coverage?.maxAmount);
    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      return { sumInsured: fallback, source: 'default' };
    }
    return { sumInsured: maxAmount, source: `policy:${policy.code}` };
  } catch (err) {
    console.warn(`[CLAIM] Policy lookup failed for "${reference}":`, err.message);
    return { sumInsured: fallback, source: 'default' };
  }
};

/* ─── Initialize Claim ─── */
exports.initializeClaim = async (req, res) => {
  try {
    const { insuranceId, formData } = req.body;
    console.log(
      `[CLAIM:INIT] User=${req.user._id}, insuranceId=${insuranceId}, cropType=${formData?.cropType}, state=${formData?.state}`
    );

    const documentId = generateDocumentId();

    if (!isDbConnected()) {
      console.warn('[CLAIM:INIT] Database not connected, storing claim in memory (development fallback)');
      const cached = {
        documentId,
        userId: req.user._id,
        insuranceId,
        ...formData,
        status: 'draft',
        uploadedImages: [],
        createdAt: new Date(),
      };
      saveToCache(documentId, cached);
      return res.status(201).json({
        success: true,
        message: 'Claim initialized',
        claim: { id: documentId, documentId, status: 'draft' },
      });
    }

    const claim = await Claim.create({
      documentId,
      userId: req.user._id,
      insuranceId,
      ...formData,
      status: 'draft',
    });
    console.log(`[CLAIM:INIT] Saved to database: documentId=${documentId}`);

    res.status(201).json({
      success: true,
      message: 'Claim initialized',
      claim: { id: claim._id, documentId, status: 'draft' },
    });
  } catch (err) {
    console.error('[CLAIM:INIT] Failed to initialize claim:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Invalid claim details' });
    }
    res.status(500).json({ success: false, error: 'Failed to initialize claim' });
  }
};

/* ─── Upload Single Image ─── */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      console.warn('[CLAIM:UPLOAD] No file in request');
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { lat, lon, client_ts, parcel_id, step_id, media_type } = req.body;
    console.log(
      `[CLAIM:UPLOAD] parcel_id=${parcel_id}, step_id=${step_id}, file=${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)`
    );

    // The claim must exist and belong to the caller before its evidence folder
    // accepts a file, otherwise any authenticated user could push media into
    // somebody else's claim.
    const { claim, error } = await loadAccessibleClaim(parcel_id, req.user);
    if (error) {
      discardUpload(req.file.path);
      return res.status(error.status).json(error.body);
    }

    if (!['draft', 'submitted'].includes(claim.status)) {
      discardUpload(req.file.path);
      return res.status(409).json({
        success: false,
        error: `Evidence cannot be added to a claim that is ${claim.status}`,
      });
    }

    const coords = { lat: Number(lat), lon: Number(lon) };

    // Upload to Cloudinary
    let cloudinaryData = {};
    try {
      cloudinaryData = await uploadClaimImage(req.file.path, parcel_id, step_id);
    } catch (err) {
      console.warn('[CLAIM:UPLOAD] Cloudinary upload failed, keeping local file:', err.message);
    }

    const capturedAt = new Date(Number(client_ts) || Date.now());
    const imageDoc = {
      stepId: step_id,
      originalName: req.file.originalname,
      cloudinaryUrl: cloudinaryData.url || '',
      cloudinaryPublicId: cloudinaryData.publicId || '',
      localPath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      coordinates: coords,
      capturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
      mediaType: media_type || 'photo',
    };

    if (isDbConnected()) {
      const updated = await Claim.findOneAndUpdate(
        { documentId: parcel_id, userId: claim.userId },
        { $push: { uploadedImages: imageDoc } },
        { new: true, runValidators: true }
      );
      if (!updated) {
        discardUpload(req.file.path);
        return res.status(404).json({ success: false, error: 'Claim not found' });
      }
    } else {
      const cached = getFromCache(parcel_id);
      cached.uploadedImages = cached.uploadedImages || [];
      cached.uploadedImages.push(imageDoc);
      saveToCache(parcel_id, cached);
    }

    res.json({ success: true, message: 'File uploaded', stepId: step_id });
  } catch (err) {
    console.error('[CLAIM:UPLOAD] Upload failed:', err.message);
    discardUpload(req.file?.path);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
};

/* ─── Complete Claim (trigger Python processing) ─── */
exports.completeClaim = async (req, res) => {
  const { documentId } = req.body;
  let transitioned = false;

  try {
    console.log(`[CLAIM:COMPLETE] Starting processing for documentId=${documentId}`);

    const { claim, error } = await loadAccessibleClaim(documentId, req.user);
    if (error) return res.status(error.status).json(error.body);

    // Claim the claim: move draft/submitted to processing in one atomic update so
    // two concurrent submissions cannot both run the pipeline, and so a completed
    // claim (or an admin's decision) can never be overwritten by a resubmission.
    if (isDbConnected()) {
      const locked = await Claim.findOneAndUpdate(
        { documentId, userId: claim.userId, status: { $in: ['draft', 'submitted'] } },
        { $set: { status: 'processing', submittedAt: new Date() } },
        { new: true }
      );
      if (!locked) {
        return res.status(409).json({
          success: false,
          error: `Claim is ${claim.status} and cannot be submitted again`,
          status: claim.status,
        });
      }
      transitioned = true;
    } else if (!['draft', 'submitted'].includes(claim.status)) {
      return res.status(409).json({
        success: false,
        error: `Claim is ${claim.status} and cannot be submitted again`,
        status: claim.status,
      });
    }

    const images = claim.uploadedImages || [];
    const imagePaths = images
      .filter((i) => i.localPath && i.mediaType === 'photo' && fs.existsSync(i.localPath))
      .map((i) => i.localPath);

    let userLat = null;
    let userLon = null;
    for (const img of images) {
      if (Number.isFinite(img.coordinates?.lat) && Number.isFinite(img.coordinates?.lon)) {
        userLat = img.coordinates.lat;
        userLon = img.coordinates.lon;
        break;
      }
    }

    const { sumInsured, source: sumInsuredSource } = await resolveSumInsured(claim);

    let pythonResult;
    let decision;
    let pipelineFailure = null;

    if (imagePaths.length === 0) {
      pipelineFailure = 'no photo evidence was available for analysis';
      console.error(`[CLAIM:COMPLETE] ${documentId}: ${pipelineFailure}`);
      pythonResult = fallbackResult(pipelineFailure, 'no_input');
      decision = undeterminedDecision(pipelineFailure);
    } else {
      try {
        // No claimed-damage figure is collected from the farmer today, so none
        // is passed: the pipeline reports the damage it measures rather than a
        // placeholder attributed to the farmer.
        pythonResult = await runPipeline(imagePaths, { userLat, userLon, sumInsured });
        decision = determineDecision(pythonResult.overall_assessment?.confidence_score);
      } catch (err) {
        // A pipeline that did not run is not evidence about the claim, so the
        // claim goes to a human rather than being auto-approved or auto-rejected.
        pipelineFailure = err.message;
        console.error(
          `[CLAIM:COMPLETE] ${documentId}: analysis pipeline failed (stage=${err.stage || 'unknown'}): ${err.message}`
        );
        pythonResult = fallbackResult(err.message, err.stage || 'unknown');
        decision = undeterminedDecision(err.message);
      }
    }

    const confidence = Number(pythonResult.overall_assessment?.confidence_score);
    const payoutAmount = decision.payout_approved ? readPipelinePayout(pythonResult) : 0;

    const processingResult = {
      ...pythonResult,
      claim_id: documentId,
      decision,
      sum_insured_source: sumInsuredSource,
      verification_evidence: {
        authenticity_verified: Number(pythonResult.verification_results?.exif?.score) > 0.5,
        location_verified: pythonResult.verification_results?.geolocation?.status === 'PASS',
        weather_verified: pythonResult.verification_results?.weather?.status === 'MATCH',
        details: pythonResult.verification_results || {},
      },
    };

    // Generate AI summary using Gemini
    try {
      const aiSummary = await summarizeClaimResult(processingResult, {
        documentId,
        cropType: claim.cropType,
        farmArea: claim.farmArea,
        lossReason: claim.lossReason,
        season: claim.season,
        state: claim.state,
      });
      processingResult.aiSummary = aiSummary;
    } catch (err) {
      console.warn(`[CLAIM:COMPLETE] ${documentId}: AI summary unavailable:`, err.message);
    }

    const finalStatus =
      decision.status === 'approved' ? 'approved' : decision.status === 'rejected' ? 'rejected' : 'manual_review';

    const update = {
      processingResult,
      status: finalStatus,
      confidenceScore: Number.isFinite(confidence) ? confidence : null,
      payoutAmount,
      payoutStatus: payoutAmount > 0 ? 'pending' : 'none',
      rejectionReason: finalStatus === 'rejected' ? decision.reason : '',
      completedAt: new Date(),
    };

    if (isDbConnected()) {
      await Claim.findOneAndUpdate({ documentId }, update, { new: true });
    } else {
      saveToCache(documentId, { ...claim, ...(getFromCache(documentId) || {}), ...update });
    }
    transitioned = false;

    // Notify the claim owner, not whoever triggered processing.
    if (isDbConnected()) {
      try {
        await Notification.create({
          userId: claim.userId,
          title: 'Claim Processed',
          message: decision.reason,
          type: 'claim_update',
        });
      } catch (err) {
        console.warn(`[CLAIM:COMPLETE] ${documentId}: notification not created:`, err.message);
      }
    }

    // Clean up local files only if Cloudinary upload succeeded
    for (const img of images) {
      if (img.cloudinaryUrl && img.localPath) discardUpload(img.localPath);
    }

    res.json({
      success: true,
      message: 'Claim completed',
      pipelineFailed: Boolean(pipelineFailure),
      claim: { documentId, status: finalStatus, completedAt: update.completedAt, processingResult },
    });
  } catch (err) {
    console.error(`[CLAIM:COMPLETE] Failed to complete claim ${documentId}:`, err.message);

    // Never leave a claim stuck in 'processing' because of an unexpected error.
    if (transitioned && isDbConnected()) {
      try {
        await Claim.findOneAndUpdate(
          { documentId, status: 'processing' },
          { status: 'manual_review', completedAt: new Date() }
        );
      } catch (recoveryErr) {
        console.error(
          `[CLAIM:COMPLETE] ${documentId} left in 'processing', status recovery also failed:`,
          recoveryErr.message
        );
      }
    }

    res.status(500).json({ success: false, error: 'Failed to complete claim' });
  }
};

/* ─── Get Claim Results ─── */
exports.getClaimResults = async (req, res) => {
  try {
    const { documentId } = req.params;

    const { claim, error } = await loadAccessibleClaim(documentId, req.user);
    if (error) return res.status(error.status).json(error.body);

    // Build image URLs (prefer Cloudinary, fall back to local serving)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrls = (claim.uploadedImages || []).map((img) => ({
      stepId: img.stepId,
      url: img.cloudinaryUrl || (img.localPath ? `${baseUrl}/uploads/${path.basename(img.localPath)}` : ''),
      coordinates: img.coordinates,
      mediaType: img.mediaType,
    }));

    res.json({
      success: true,
      claim: {
        documentId,
        status: claim.status,
        submitted_at: claim.submittedAt || claim.completedAt,
        rejectionReason: claim.rejectionReason || null,
        resubmissionCount: claim.resubmissionCount || 0,
        resubmittedFrom: claim.resubmittedFrom || null,
        confidenceScore: claim.confidenceScore ?? null,
        payoutAmount: claim.payoutAmount || 0,
        insuranceId: claim.insuranceId || null,
        uploadedImages: imageUrls,
      },
      processing_result: claim.processingResult || {},
      metadata: { pythonWorker: isPipelineAvailable() ? 'used' : 'unavailable' },
    });
  } catch (err) {
    console.error('[CLAIM:RESULTS] Failed to fetch results:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
};

/* ─── List User Claims ─── */
exports.listClaims = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    let claims;
    let total;

    if (isDbConnected()) {
      const filter = req.user.role === 'admin' ? {} : { userId: req.user._id };
      [claims, total] = await Promise.all([
        Claim.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'phoneNumber fullName'),
        Claim.countDocuments(filter),
      ]);
    } else {
      // Development fallback. Still scoped to the caller: the cache holds every
      // user's claims, so returning it unfiltered would leak them.
      const visible = Array.from(claimCache.values()).filter((c) => canAccess(c, req.user));
      total = visible.length;
      claims = visible.slice(skip, skip + limit);
    }

    res.json({
      success: true,
      claims: claims.map((c) => ({
        documentId: c.documentId,
        status: c.status,
        cropType: c.cropType,
        farmArea: c.farmArea,
        lossReason: c.lossReason,
        lossDescription: c.lossDescription,
        payoutAmount: c.payoutAmount || 0,
        confidenceScore: c.confidenceScore ?? null,
        rejectionReason: c.rejectionReason || c.reviewNotes || '',
        resubmissionCount: c.resubmissionCount || 0,
        submittedAt: c.submittedAt || c.createdAt,
        reviewedAt: c.reviewedAt,
        user: c.userId?.phoneNumber
          ? { phoneNumber: c.userId.phoneNumber, fullName: c.userId.fullName }
          : undefined,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[CLAIM:LIST] Failed to fetch claims:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch claims' });
  }
};

/* ─── Resubmit Rejected Claim ─── */
exports.resubmitClaim = async (req, res) => {
  try {
    const { documentId } = req.params;

    const { claim: originalClaim, error } = await loadAccessibleClaim(documentId, req.user);
    if (error) return res.status(error.status).json(error.body);

    // A resubmission copies the original's details into a new claim owned by the
    // caller, so only the owner may do it - an admin viewing the claim must not
    // silently file a copy under their own account.
    if (!isOwner(originalClaim, req.user)) {
      return res.status(403).json({ success: false, error: 'Only the claim owner can resubmit this claim' });
    }

    if (originalClaim.status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'Only rejected claims can be resubmitted' });
    }

    const maxResubmissions = Number(process.env.MAX_RESUBMISSIONS) || 3;
    if ((originalClaim.resubmissionCount || 0) >= maxResubmissions) {
      return res.status(400).json({
        success: false,
        error: `This claim has already been resubmitted ${maxResubmissions} times`,
      });
    }

    const newDocumentId = generateDocumentId();
    const carried = {
      documentId: newDocumentId,
      userId: req.user._id,
      insuranceId: originalClaim.insuranceId,
      policyId: originalClaim.policyId,
      state: originalClaim.state,
      season: originalClaim.season,
      scheme: originalClaim.scheme,
      year: originalClaim.year,
      insuranceNumber: originalClaim.insuranceNumber,
      cropType: originalClaim.cropType,
      farmArea: originalClaim.farmArea,
      lossReason: originalClaim.lossReason,
      lossDescription: originalClaim.lossDescription,
      resubmittedFrom: documentId,
      resubmissionCount: (originalClaim.resubmissionCount || 0) + 1,
      status: 'draft',
    };

    if (isDbConnected()) {
      await Claim.create(carried);
    } else {
      saveToCache(newDocumentId, { ...carried, uploadedImages: [], createdAt: new Date() });
    }

    res.status(201).json({
      success: true,
      message: 'Claim resubmission initialized. Please upload new evidence photos.',
      claim: { documentId: newDocumentId, resubmittedFrom: documentId, status: 'draft' },
    });
  } catch (err) {
    console.error('[CLAIM:RESUBMIT] Failed to resubmit claim:', err.message);
    res.status(500).json({ success: false, error: 'Failed to resubmit claim' });
  }
};

/* ─── On-demand AI Summary ─── */
exports.summarizeClaim = async (req, res) => {
  try {
    const { documentId } = req.params;

    const { claim, error } = await loadAccessibleClaim(documentId, req.user);
    if (error) return res.status(error.status).json(error.body);

    const pr = claim.processingResult || {};

    // Return cached summary if available
    if (pr.aiSummary && pr.aiSummary.generatedBy !== 'fallback' && !req.query.refresh) {
      return res.json({ success: true, aiSummary: pr.aiSummary, cached: true });
    }

    const aiSummary = await summarizeClaimResult(pr, {
      documentId,
      cropType: claim.cropType,
      farmArea: claim.farmArea,
      lossReason: claim.lossReason,
      season: claim.season,
      state: claim.state,
    });

    if (isDbConnected()) {
      try {
        await Claim.findOneAndUpdate({ documentId }, { 'processingResult.aiSummary': aiSummary });
      } catch (err) {
        console.warn(`[CLAIM:SUMMARIZE] ${documentId}: summary not persisted:`, err.message);
      }
    }

    res.json({ success: true, aiSummary, cached: false, geminiAvailable: isGeminiAvailable() });
  } catch (err) {
    console.error('[CLAIM:SUMMARIZE] Failed to generate summary:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate summary' });
  }
};

// Exported for tests
exports._claimCache = claimCache;
