const path = require('path');
const User = require('../models/User');
const Claim = require('../models/Claim');
const AdminAction = require('../models/AdminAction');
const Notification = require('../models/Notification');

// Escape regex special characters to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Statuses whose payout has already left the system; re-reviewing one would
// change the record of a payment that was already made.
const SETTLED_STATUSES = ['payout_complete'];

/**
 * Payout to record when an admin approves a claim, or null when there is no
 * figure to record.
 *
 * An explicit amount always wins, including an explicit 0. With none supplied
 * the pipeline's own calculated figure is adopted, because a claim routed to
 * manual_review is stored with payoutAmount 0 - approving it without typing an
 * amount would otherwise approve the farmer for nothing.
 *
 * A run that failed carries no figure even though it persisted one: its zero is
 * the stand-in `fallbackResult` records for a claim nothing measured, not a
 * calculated entitlement. Null in that case makes the caller ask for an amount
 * rather than silently settling on that zero.
 */
const resolveApprovedPayout = (claim, requestedAmount) => {
  if (requestedAmount !== undefined) return requestedAmount;

  const result = claim.processingResult;
  if (!result || result.pipeline_failed) return null;

  const calculated = Number(result.payout_calculation?.payout_amount);
  return Number.isFinite(calculated) && calculated >= 0 ? calculated : null;
};

// Written only by releasePayout, so a claim counts as paid once an admin has
// explicitly released its payout - never merely because it was approved.
const DISBURSED_FILTER = { status: 'payout_complete', payoutStatus: 'completed' };

// The state a claim must be in for its payout to be released: approved, with a
// non-zero amount still waiting to be paid.
const RELEASABLE_FILTER = { status: 'approved', payoutStatus: 'pending', payoutAmount: { $gt: 0 } };

/** Why a claim's payout cannot be released, or null when it can. */
const payoutReleaseBlocker = (claim) => {
  if (claim.status === 'payout_complete') return 'This payout has already been released';
  if (claim.status !== 'approved') return `Claim is ${claim.status}; only an approved claim can have its payout released`;
  if (claim.payoutStatus !== 'pending' || !(claim.payoutAmount > 0)) return 'This claim has no pending payout to release';
  return null;
};

const readPaging = (req, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

/** Default farmer notification for a review that came without notes. */
const reviewMessage = (documentId, status, payoutAmount) => {
  if (status !== 'approved') return `Your claim ${documentId} has been ${status}.`;
  return payoutAmount > 0
    ? `Your claim ${documentId} has been approved for a payout of INR ${payoutAmount.toLocaleString('en-IN')}.`
    : `Your claim ${documentId} has been approved with no payout due.`;
};

/* ─── Dashboard Stats ─── */
exports.dashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalClaims, statusCounts, disbursed, recentClaims] = await Promise.all([
      User.countDocuments({ role: 'farmer' }),
      Claim.countDocuments(),
      Claim.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      // Money that has actually been paid out. Approved and pending payouts are
      // a promise, not a disbursement, so they are not counted here.
      Claim.aggregate([
        { $match: DISBURSED_FILTER },
        { $group: { _id: null, total: { $sum: '$payoutAmount' }, count: { $sum: 1 } } },
      ]),
      Claim.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'phoneNumber fullName'),
    ]);

    const statusMap = {};
    statusCounts.forEach((s) => (statusMap[s._id] = s.count));

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalClaims,
        approvedClaims: statusMap.approved || 0,
        rejectedClaims: statusMap.rejected || 0,
        pendingClaims:
          (statusMap.manual_review || 0) +
          (statusMap.submitted || 0) +
          (statusMap.draft || 0) +
          (statusMap.processing || 0),
        payoutPending: statusMap.payout_pending || 0,
        totalPayout: disbursed[0]?.total || 0,
        paidClaims: disbursed[0]?.count || 0,
      },
      recentClaims: recentClaims.map((c) => ({
        documentId: c.documentId,
        status: c.status,
        cropType: c.cropType,
        payoutAmount: c.payoutAmount,
        createdAt: c.createdAt,
        user: c.userId ? { phoneNumber: c.userId.phoneNumber, fullName: c.userId.fullName } : null,
      })),
    });
  } catch (err) {
    console.error('[ADMIN:DASHBOARD] Failed to load dashboard:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
};

/* ─── List Users ─── */
exports.listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req);
    const search = req.query.search || '';

    const filter = { role: 'farmer' };
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { phoneNumber: { $regex: safe, $options: 'i' } },
        { fullName: { $regex: safe, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v'),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[ADMIN:USERS] Failed to fetch users:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

/* ─── Toggle User Active ─── */
exports.toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // An admin locking themselves out would leave the portal unadministrable.
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot deactivate your own account' });
    }

    user.isActive = !user.isActive;
    await user.save();

    await AdminAction.create({
      adminId: req.user._id,
      action: user.isActive ? 'activate_user' : 'deactivate_user',
      targetType: 'user',
      targetId: user._id.toString(),
      ipAddress: req.ip,
    });

    res.json({ success: true, user });
  } catch (err) {
    console.error('[ADMIN:TOGGLE-USER] Failed to update user:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
};

/* ─── All Claims (Admin) ─── */
exports.allClaims = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req);
    const status = req.query.status;
    const search = req.query.search;

    const filter = {};
    if (status) {
      const allowed = Claim.schema.path('status').enumValues;
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status filter' });
      }
      filter.status = status;
    }
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { documentId: { $regex: safe, $options: 'i' } },
        { cropType: { $regex: safe, $options: 'i' } },
      ];
    }

    const [claims, total] = await Promise.all([
      Claim.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'phoneNumber fullName'),
      Claim.countDocuments(filter),
    ]);

    res.json({
      success: true,
      claims: claims.map((c) => ({
        _id: c._id,
        documentId: c.documentId,
        status: c.status,
        cropType: c.cropType,
        farmArea: c.farmArea,
        lossReason: c.lossReason,
        season: c.season,
        state: c.state,
        payoutAmount: c.payoutAmount,
        // Null when nothing measured the claim (for example a failed pipeline
        // run), which the queue shows as "not measured" rather than 0%.
        confidenceScore: c.confidenceScore ?? null,
        createdAt: c.createdAt,
        submittedAt: c.submittedAt,
        user: c.userId ? { phoneNumber: c.userId.phoneNumber, fullName: c.userId.fullName } : null,
        imageCount: c.uploadedImages?.length || 0,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ADMIN:CLAIMS] Failed to fetch claims:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch claims' });
  }
};

/* ─── Get Claim Detail (Admin) ─── */
exports.getClaimDetail = async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id)
      .populate('userId', 'phoneNumber fullName address farmDetails')
      .populate('payoutReleasedBy', 'phoneNumber fullName');
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    // Build fallback URLs for images missing cloudinaryUrl
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const claimObj = claim.toObject();
    if (claimObj.uploadedImages) {
      claimObj.uploadedImages = claimObj.uploadedImages.map((img) => ({
        ...img,
        cloudinaryUrl: img.cloudinaryUrl || (img.localPath ? `${baseUrl}/uploads/${path.basename(img.localPath)}` : ''),
      }));
    }

    res.json({ success: true, claim: claimObj });
  } catch (err) {
    console.error('[ADMIN:CLAIM-DETAIL] Failed to fetch claim:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch claim' });
  }
};

/* ─── Review Claim (Approve/Reject) ─── */
exports.reviewClaim = async (req, res) => {
  try {
    const { status, reviewNotes, payoutAmount } = req.body;
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    const previousStatus = claim.status;

    if (SETTLED_STATUSES.includes(claim.status)) {
      return res.status(409).json({
        success: false,
        error: `Claim is ${claim.status} and can no longer be reviewed`,
      });
    }

    let approvedPayout = null;
    if (status === 'approved') {
      approvedPayout = resolveApprovedPayout(claim, payoutAmount);
      if (approvedPayout === null) {
        return res.status(400).json({
          success: false,
          error:
            'This claim has no calculated payout figure, so approving it requires an explicit payoutAmount',
        });
      }
    }

    claim.status = status;
    claim.reviewedBy = req.user._id;
    // Only overwrite the notes when new ones were supplied, so a review that
    // omits them does not erase the previous reviewer's comments.
    if (reviewNotes !== undefined) claim.reviewNotes = reviewNotes;
    claim.reviewedAt = new Date();

    if (status === 'approved') {
      // approvedPayout is never null here, so an explicit 0 is recorded as a
      // zero-payout approval: approved, amount 0, and nothing left to pay out.
      claim.payoutAmount = approvedPayout;
      claim.payoutStatus = approvedPayout > 0 ? 'pending' : 'none';
      claim.rejectionReason = '';
    } else {
      // Reversing an earlier approval must also withdraw the pending payout;
      // leaving it behind would queue money against a claim that was refused.
      claim.payoutAmount = 0;
      claim.payoutStatus = 'none';
      claim.rejectionReason = status === 'rejected' ? reviewNotes || 'Claim rejected by admin' : '';
    }

    await claim.save();

    // Log action
    await AdminAction.create({
      adminId: req.user._id,
      action: status === 'approved' ? 'approve_claim' : status === 'rejected' ? 'reject_claim' : 'request_review',
      targetType: 'claim',
      targetId: claim._id.toString(),
      details: { reviewNotes, payoutAmount: claim.payoutAmount, previousStatus },
      ipAddress: req.ip,
    });

    // Notify farmer
    if (claim.userId) {
      try {
        await Notification.create({
          userId: claim.userId,
          title:
            status === 'approved' ? 'Claim Approved' : status === 'rejected' ? 'Claim Rejected' : 'Claim Under Review',
          message: reviewNotes || reviewMessage(claim.documentId, status, claim.payoutAmount),
          type: 'claim_update',
          relatedClaim: claim._id,
        });
      } catch (err) {
        // The review itself succeeded; a failed notification must not undo it.
        console.error(`[ADMIN:REVIEW] Notification not created for claim ${claim.documentId}:`, err.message);
      }
    }

    res.json({ success: true, claim });
  } catch (err) {
    console.error('[ADMIN:REVIEW] Failed to review claim:', err.message);
    res.status(500).json({ success: false, error: 'Failed to review claim' });
  }
};

/* ─── Release Payout ─── */
exports.releasePayout = async (req, res) => {
  try {
    const releasedAt = new Date();
    // The state check and the write are one atomic update, so two admins
    // releasing the same claim at once cannot both record a disbursement.
    const claim = await Claim.findOneAndUpdate(
      { _id: req.params.id, ...RELEASABLE_FILTER },
      {
        $set: {
          status: 'payout_complete',
          payoutStatus: 'completed',
          payoutReleasedBy: req.user._id,
          payoutDate: releasedAt,
        },
      },
      { new: true }
    );

    if (!claim) {
      const current = await Claim.findById(req.params.id);
      if (!current) return res.status(404).json({ success: false, error: 'Claim not found' });
      return res.status(409).json({
        success: false,
        error: payoutReleaseBlocker(current) || 'The payout could not be released',
      });
    }

    await AdminAction.create({
      adminId: req.user._id,
      action: 'process_payout',
      targetType: 'claim',
      targetId: claim._id.toString(),
      details: { payoutAmount: claim.payoutAmount, releasedAt },
      ipAddress: req.ip,
    });

    if (claim.userId) {
      try {
        await Notification.create({
          userId: claim.userId,
          title: 'Payout Released',
          message: `The payout of INR ${claim.payoutAmount.toLocaleString('en-IN')} for your claim ${claim.documentId} has been released.`,
          type: 'claim_update',
          relatedClaim: claim._id,
        });
      } catch (err) {
        console.error(`[ADMIN:PAYOUT] Notification not created for claim ${claim.documentId}:`, err.message);
      }
    }

    res.json({ success: true, claim });
  } catch (err) {
    console.error('[ADMIN:PAYOUT] Failed to release payout:', err.message);
    res.status(500).json({ success: false, error: 'Failed to release payout' });
  }
};

/* ─── Activity Logs ─── */
exports.activityLogs = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req, { defaultLimit: 50, maxLimit: 200 });

    const [logs, total] = await Promise.all([
      AdminAction.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('adminId', 'phoneNumber fullName'),
      AdminAction.countDocuments(),
    ]);

    res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[ADMIN:LOGS] Failed to fetch logs:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
};

// Exported for tests
exports._resolveApprovedPayout = resolveApprovedPayout;
exports._reviewMessage = reviewMessage;
