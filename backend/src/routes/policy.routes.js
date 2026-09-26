const router = require('express').Router();
const ctrl = require('../controllers/policy.controller');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { validate, validateObjectId, schemas } = require('../middleware/validate');

// Public
router.get('/list', ctrl.listPolicies);
// Declared before '/:id', which would otherwise treat "admin" as a policy id.
router.get('/admin/list', authenticate, roleGuard('admin'), ctrl.listPoliciesForAdmin);
router.get('/:id', ctrl.getPolicy);

// Admin only
router.post('/', authenticate, roleGuard('admin'), validate(schemas.createPolicy), ctrl.createPolicy);
router.put('/:id', authenticate, roleGuard('admin'), validateObjectId('id'), validate(schemas.updatePolicy), ctrl.updatePolicy);
router.delete('/:id', authenticate, roleGuard('admin'), validateObjectId('id'), ctrl.deletePolicy);

module.exports = router;
