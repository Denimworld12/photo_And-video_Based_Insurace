const router = require('express').Router();
const ctrl = require('../controllers/policy.controller');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// Public
router.get('/list', ctrl.listPolicies);
router.get('/:id', ctrl.getPolicy);

// Admin only
router.post('/', authenticate, roleGuard('admin'), ctrl.createPolicy);
router.put('/:id', authenticate, roleGuard('admin'), ctrl.updatePolicy);
router.delete('/:id', authenticate, roleGuard('admin'), ctrl.deletePolicy);

module.exports = router;
