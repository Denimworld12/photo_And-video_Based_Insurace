const fs = require('fs');
const path = require('path');
const Claim = require('../models/Claim');
const Notification = require('../models/Notification');
const { uploadClaimImage } = require('../services/cloudinary.service');
const { runPipeline, fallbackResult, determineDecision, isPipelineAvailable } = require('../services/python.service');
const { summarizeClaimResult, analyzeImage, isAvailable: isGeminiAvailable } = require('../services/gemini.service');

// In-memory fallback when DB is unavailable
const claimCache = new Map();

/* ─── helpers ─── */
const saveToCache = (docId, data) => claimCache.set(docId, data);
const getFromCache = (docId) => claimCache.get(docId);

/* ─── Initialize Claim ─── */
exports.initializeClaim = async (req, res) => {
  try {
    const { insuranceId, formData } = req.body;
    console.log(`[CLAIM:INIT] User=${req.user._id}, insuranceId=${insuranceId}, cropType=${formData?.cropType}, state=${formData?.state}`);

    const ts = Date.now().toString().slice(-8);
    const rnd = Math.floor(Math.random() * 90 + 10);
    const letters = Math.random().toString(36).substring(2, 4).toUpperCase();
    const documentId = `CLM-${ts}${rnd}-${letters}`;

    let claim;
    try {
      claim = await Claim.create({
        documentId,
        userId: req.user._id,
        insuranceId,
        ...formData,
        status: 'draft',
      });
      console.log(`[CLAIM:INIT] ✅ Saved to DB: documentId=${documentId}`);
    } catch (dbErr) {
      // DB unavailable – cache it
      console.warn(`[CLAIM:INIT] ⚠️ DB write failed (${dbErr.message}), using cache`);
      claim = { documentId, userId: req.user._id, insuranceId, ...formData, status: 'draft', uploadedImages: [], createdAt: new Date() };
      saveToCache(documentId, claim);
    }

    res.status(201).json({
      success: true,
      message: 'Claim initialized',
      claim: { id: claim._id || documentId, documentId, status: 'draft' },
    });
  } catch (err) {
    console.error('[CLAIM:INIT] ❌ Error:', err.message);
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
    console.log(`[CLAIM:UPLOAD] parcel_id=${parcel_id}, step_id=${step_id}, file=${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)`);

    const coords = { lat: parseFloat(lat), lon: parseFloat(lon) };

    if (isNaN(coords.lat) || isNaN(coords.lon)) {
      console.warn(`[CLAIM:UPLOAD] Invalid coordinates: lat=${lat}, lon=${lon}`);
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    // Upload to Cloudinary
    let cloudinaryData = {};
    try {
      cloudinaryData = await uploadClaimImage(req.file.path, parcel_id, step_id);
    } catch (err) {
      console.warn('⚠️ Cloudinary upload failed, keeping local file:', err.message);
    }

    const imageDoc = {
      stepId: step_id,
      originalName: req.file.originalname,
      cloudinaryUrl: cloudinaryData.url || '',
      cloudinaryPublicId: cloudinaryData.publicId || '',
      localPath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      coordinates: coords,
      capturedAt: new Date(Number(client_ts) || Date.now()),
      mediaType: media_type || 'photo',
    };

    // Save to DB or cache
    try {
      await Claim.findOneAndUpdate(
        { documentId: parcel_id },
        { $push: { uploadedImages: imageDoc } },
        { new: true }
      );
    } catch {
      const cached = getFromCache(parcel_id) || { documentId: parcel_id, uploadedImages: [] };
      cached.uploadedImages = cached.uploadedImages || [];
      cached.uploadedImages.push(imageDoc);
      saveToCache(parcel_id, cached);
    }

    res.json({ success: true, message: 'File uploaded', stepId: step_id });
  } catch (err) {
    console.error('[CLAIM:UPLOAD] ❌ Error:', err.message);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
};

/* ─── Complete Claim (trigger Python processing) ─── */
exports.completeClaim = async (req, res) => {
  try {
    const { documentId } = req.body;
    console.log(`[CLAIM:COMPLETE] Starting processing for documentId=${documentId}`);

    let claim;
    try {
      claim = await Claim.findOne({ documentId });
    } catch {
      claim = getFromCache(documentId);
    }

    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    // Gather image paths (prefer local for Python processing)
    const images = claim.uploadedImages || [];
    const imagePaths = images.filter((i) => i.localPath && i.mediaType === 'photo').map((i) => i.localPath);

    let userLat = null, userLon = null;
    for (const img of images) {
      if (img.coordinates?.lat) { userLat = img.coordinates.lat; userLon = img.coordinates.lon; break; }
    }

    let pythonResult;
    try {
      pythonResult = await runPipeline(imagePaths, { userLat, userLon });
    } catch (err) {
      console.error('❌ Python pipeline failed:', err.message);
      pythonResult = fallbackResult(err.message);
    }

    // Determine decision
    const confidence = pythonResult.overall_assessment?.confidence_score || 0;
    const decision = determineDecision(confidence);

    const processingResult = {
      ...pythonResult,
      claim_id: `CLM_${Date.now()}`,
      decision,
      verification_evidence: {
        authenticity_verified: pythonResult.verification_results?.exif?.score > 0.5,
        location_verified: pythonResult.verification_results?.geolocation?.status === 'PASS',
        weather_verified: pythonResult.verification_results?.weather?.status === 'MATCH',
        details: pythonResult.verification_results,
      },
    };

    // Generate AI summary using Gemini
    try {
      const claimInfo = {
        documentId,
        cropType: claim.cropType,
        farmArea: claim.farmArea,
        lossReason: claim.lossReason,
        season: claim.season,
        state: claim.state,
      };
      const aiSummary = await summarizeClaimResult(processingResult, claimInfo);
      processingResult.aiSummary = aiSummary;
    } catch (err) {
      console.warn('⚠️ Gemini summary failed:', err.message);
    }

    // Persist result
    try {
      await Claim.findOneAndUpdate(
        { documentId },
        {
          processingResult,
          status: decision.status === 'approved' ? 'approved' : decision.status === 'rejected' ? 'rejected' : 'manual_review',
          confidenceScore: confidence,
          payoutAmount: decision.payout_approved ? (pythonResult.payout_calculation?.final_payout_amount || 0) : 0,
          submittedAt: new Date(),
          completedAt: new Date(),
        },
        { new: true }
      );
    } catch {
      const cached = getFromCache(documentId) || {};
      cached.processingResult = processingResult;
      cached.status = decision.status;
      cached.completedAt = new Date();
      saveToCache(documentId, cached);
    }

    // Create notification
    try {
      await Notification.create({
        userId: req.user._id,
        title: 'Claim Processed',
        message: decision.reason,
        type: 'claim_update',
      });
    } catch { /* ignore notification failure */ }

    // Clean up local files only if Cloudinary upload succeeded
    for (const img of images) {
      if (img.cloudinaryUrl && img.localPath && fs.existsSync(img.localPath)) {
        fs.unlink(img.localPath, () => {});
      }
    }

    res.json({
      success: true,
      message: 'Claim completed',
      claim: { documentId, status: decision.status, completedAt: new Date(), processingResult },
    });
  } catch (err) {
    console.error(`[CLAIM:COMPLETE] ❌ Error for ${req.body?.documentId}:`, err.message);
    res.status(500).json({ success: false, error: 'Failed to complete claim' });
  }
};

/* ─── Get Claim Results ─── */
exports.getClaimResults = async (req, res) => {
  try {
    const { documentId } = req.params;

    let claim;
    try {
      claim = await Claim.findOne({ documentId }).populate('userId', 'phoneNumber fullName');
    } catch {
      claim = getFromCache(documentId);
    }

    if (!claim) {
      return res.json({
        success: true,
        claim: { documentId, status: 'not_found' },
        processing_result: { overall_confidence: 0, recommendation: { status: 'error', reason: 'Claim not found' } },
      });
    }

    // Ownership check: only the claim owner or an admin can view results
    const claimUserId = claim.userId?._id?.toString() || claim.userId?.toString();
    if (req.user.role !== 'admin' && claimUserId && claimUserId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

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
        confidenceScore: claim.confidenceScore || null,
        insuranceId: claim.insuranceId || null,
        uploadedImages: imageUrls,
      },
      processing_result: claim.processingResult || {},
      metadata: { pythonWorker: isPipelineAvailable() ? 'used' : 'fallback' },
    });
  } catch (err) {
    console.error('❌ getClaimResults:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
};

/* ─── List User Claims ─── */
exports.listClaims = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    let claims, total;
    try {
      const filter = req.user.role === 'admin' ? {} : { userId: req.user._id };
      [claims, total] = await Promise.all([
        Claim.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'phoneNumber fullName'),
        Claim.countDocuments(filter),
      ]);
    } catch {
      // Fallback – return from cache
      const all = Array.from(claimCache.values());
      claims = all.slice(skip, skip + limit);
      total = all.length;
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
        confidenceScore: c.confidenceScore || 0,
        rejectionReason: c.rejectionReason || c.reviewNotes || '',
        resubmissionCount: c.resubmissionCount || 0,
        submittedAt: c.submittedAt || c.createdAt,
        reviewedAt: c.reviewedAt,
        user: c.userId ? { phoneNumber: c.userId.phoneNumber, fullName: c.userId.fullName } : undefined,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('❌ listClaims:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch claims' });
  }
};

/* ─── Resubmit Rejected Claim ─── */
exports.resubmitClaim = async (req, res) => {
  try {
    const { documentId } = req.params;

    let originalClaim;
    try {
      originalClaim = await Claim.findOne({ documentId });
    } catch {
      originalClaim = getFromCache(documentId);
    }

    if (!originalClaim) {
      return res.status(404).json({ success: false, error: 'Original claim not found' });
    }

    if (originalClaim.status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'Only rejected claims can be resubmitted' });
    }

    // Create new claim based on original
    const ts = Date.now().toString().slice(-8);
    const rnd = Math.floor(Math.random() * 90 + 10);
    const letters = Math.random().toString(36).substring(2, 4).toUpperCase();
    const newDocumentId = `CLM-${ts}${rnd}-${letters}`;

    let newClaim;
    try {
      newClaim = await Claim.create({
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
      });
    } catch {
      newClaim = {
        documentId: newDocumentId,
        userId: req.user._id,
        resubmittedFrom: documentId,
        resubmissionCount: (originalClaim.resubmissionCount || 0) + 1,
        status: 'draft',
        uploadedImages: [],
        createdAt: new Date(),
      };
      saveToCache(newDocumentId, newClaim);
    }

    res.status(201).json({
      success: true,
      message: 'Claim resubmission initialized. Please upload new evidence photos.',
      claim: {
        documentId: newDocumentId,
        resubmittedFrom: documentId,
        status: 'draft',
      },
    });
  } catch (err) {
    console.error('❌ resubmitClaim:', err);
    res.status(500).json({ success: false, error: 'Failed to resubmit claim' });
  }
};

/* ─── On-demand AI Summary ─── */
exports.summarizeClaim = async (req, res) => {
  try {
    const { documentId } = req.params;

    let claim;
    try {
      claim = await Claim.findOne({ documentId });
    } catch {
      claim = getFromCache(documentId);
    }

    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    const pr = claim.processingResult || {};

    // Return cached summary if available
    if (pr.aiSummary && pr.aiSummary.generatedBy !== 'fallback' && !req.query.refresh) {
      return res.json({ success: true, aiSummary: pr.aiSummary, cached: true });
    }

    const claimInfo = {
      documentId,
      cropType: claim.cropType,
      farmArea: claim.farmArea,
      lossReason: claim.lossReason,
      season: claim.season,
      state: claim.state,
    };

    const aiSummary = await summarizeClaimResult(pr, claimInfo);

    // Persist the summary
    try {
      await Claim.findOneAndUpdate(
        { documentId },
        { 'processingResult.aiSummary': aiSummary },
      );
    } catch { /* ignore */ }

    res.json({ success: true, aiSummary, cached: false, geminiAvailable: isGeminiAvailable() });
  } catch (err) {
    console.error('❌ summarizeClaim:', err);
    res.status(500).json({ success: false, error: 'Failed to generate summary' });
  }
};
