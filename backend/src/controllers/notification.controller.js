const Notification = require('../models/Notification');

/* ─── List Notifications ─── */
exports.list = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [notifications, total, unread] = await Promise.all([
      Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ userId: req.user._id }),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    res.json({ success: true, notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

/* ─── Mark As Read ─── */
exports.markRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
};

/* ─── Mark All Read ─── */
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true, readAt: new Date() });
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
};
