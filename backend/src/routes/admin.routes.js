const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { validate, schemas } = require('../middleware/validate');

// All admin routes require authentication + admin role
router.use(authenticate, roleGuard('admin'));

router.get('/dashboard', ctrl.dashboardStats);
router.get('/users', ctrl.listUsers);
router.patch('/users/:id/toggle-active', ctrl.toggleUserActive);
router.get('/claims', ctrl.allClaims);
router.get('/claims/:id', ctrl.getClaimDetail);
router.patch('/claims/:id/review', validate(schemas.adminReview), ctrl.reviewClaim);
router.get('/activity-logs', ctrl.activityLogs);

module.exports = router;
