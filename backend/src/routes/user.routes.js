const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);

router.get('/profile', ctrl.getProfile);
router.put('/profile', validate(schemas.updateProfile), ctrl.updateProfile);

module.exports = router;
