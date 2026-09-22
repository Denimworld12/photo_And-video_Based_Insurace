const Notification = require('../models/Notification');

const readPaging = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

/* ─── List Notifications ─── */
exports.list = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req);

    const [notifications, total, unread] = await Promise.all([
      Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ userId: req.user._id }),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    res.json({ success: true, notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[NOTIFICATION:LIST] Failed to fetch notifications:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

/* ─── Mark As Read ─── */
exports.markRead = async (req, res) => {
  try {
    // Scoped to the caller, so one user cannot mark another user's notification.
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    console.error('[NOTIFICATION:READ] Failed to update notification:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
};

/* ─── Mark All Read ─── */
exports.markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'All marked as read', updated: result.modifiedCount });
  } catch (err) {
    console.error('[NOTIFICATION:READ-ALL] Failed to update notifications:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
};
