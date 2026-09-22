const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validate');

router.use(authenticate);

router.get('/', ctrl.list);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validateObjectId('id'), ctrl.markRead);

module.exports = router;
