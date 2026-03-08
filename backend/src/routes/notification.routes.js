const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);

module.exports = router;
