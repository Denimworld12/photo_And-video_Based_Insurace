const User = require('../models/User');
const Claim = require('../models/Claim');
const AdminAction = require('../models/AdminAction');
const Notification = require('../models/Notification');

// Escape regex special characters to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ─── Dashboard Stats ─── */
exports.dashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalClaims, statusCounts, recentClaims] = await Promise.all([
      User.countDocuments({ role: 'farmer' }).catch(() => 0),
      Claim.countDocuments().catch(() => 0),
      Claim.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).catch(() => []),
      Claim.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'phoneNumber fullName').catch(() => []),
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
        pendingClaims: (statusMap.manual_review || 0) + (statusMap.submitted || 0) + (statusMap.draft || 0),
        payoutPending: statusMap.payout_pending || 0,
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
    console.error('❌ dashboardStats:', err);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
};

/* ─── List Users ─── */
exports.listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const filter = { role: 'farmer' };
    if (search) {
      const safe = escapeRegex(search);
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
    console.error('❌ listUsers:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

/* ─── Toggle User Active ─── */
exports.toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

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
    console.error('❌ toggleUserActive:', err);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
};

/* ─── All Claims (Admin) ─── */
exports.allClaims = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const status = req.query.status;
    const search = req.query.search;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const safe = escapeRegex(search);
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
        createdAt: c.createdAt,
        submittedAt: c.submittedAt,
        user: c.userId ? { phoneNumber: c.userId.phoneNumber, fullName: c.userId.fullName } : null,
        imageCount: c.uploadedImages?.length || 0,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('❌ allClaims:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch claims' });
  }
};

/* ─── Get Claim Detail (Admin) ─── */
exports.getClaimDetail = async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id).populate('userId', 'phoneNumber fullName address farmDetails');
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    // Build fallback URLs for images missing cloudinaryUrl
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const claimObj = claim.toObject();
    if (claimObj.uploadedImages) {
      claimObj.uploadedImages = claimObj.uploadedImages.map((img) => ({
        ...img,
        cloudinaryUrl: img.cloudinaryUrl || (img.localPath ? `${baseUrl}/uploads/${require('path').basename(img.localPath)}` : ''),
      }));
    }

    res.json({ success: true, claim: claimObj });
  } catch (err) {
    console.error('❌ getClaimDetail:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch claim' });
  }
};

/* ─── Review Claim (Approve/Reject) ─── */
exports.reviewClaim = async (req, res) => {
  try {
    const { status, reviewNotes, payoutAmount } = req.body;
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    claim.status = status;
    claim.reviewedBy = req.user._id;
    claim.reviewNotes = reviewNotes;
    claim.reviewedAt = new Date();
    if (status === 'rejected') {
      claim.rejectionReason = reviewNotes || 'Claim rejected by admin';
    }
    if (status === 'approved' && payoutAmount) {
      claim.payoutAmount = payoutAmount;
      claim.payoutStatus = 'pending';
    }
    await claim.save();

    // Log action
    await AdminAction.create({
      adminId: req.user._id,
      action: status === 'approved' ? 'approve_claim' : status === 'rejected' ? 'reject_claim' : 'request_review',
      targetType: 'claim',
      targetId: claim._id.toString(),
      details: { reviewNotes, payoutAmount },
      ipAddress: req.ip,
    });

    // Notify farmer
    if (claim.userId) {
      await Notification.create({
        userId: claim.userId,
        title: status === 'approved' ? 'Claim Approved!' : status === 'rejected' ? 'Claim Rejected' : 'Claim Under Review',
        message: reviewNotes || `Your claim ${claim.documentId} has been ${status}.`,
        type: 'claim_update',
        relatedClaim: claim._id,
      });
    }

    res.json({ success: true, claim });
  } catch (err) {
    console.error('❌ reviewClaim:', err);
    res.status(500).json({ success: false, error: 'Failed to review claim' });
  }
};

/* ─── Activity Logs ─── */
exports.activityLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminAction.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('adminId', 'phoneNumber fullName'),
      AdminAction.countDocuments(),
    ]);

    res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('❌ activityLogs:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
};
