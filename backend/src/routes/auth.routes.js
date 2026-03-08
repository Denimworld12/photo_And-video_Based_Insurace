const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.post('/send-otp', validate(schemas.sendOtp), ctrl.sendOtp);
router.post('/verify-otp', validate(schemas.verifyOtp), ctrl.verifyOtp);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
