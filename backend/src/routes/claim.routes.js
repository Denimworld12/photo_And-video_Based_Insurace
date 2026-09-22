const router = require('express').Router();
const ctrl = require('../controllers/claim.controller');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);

router.get('/list', ctrl.listClaims);
router.post('/initialize', validate(schemas.claimForm), ctrl.initializeClaim);
// multer runs first so the multipart fields are parsed into req.body, then the
// same Joi validation every other endpoint gets is applied to them.
router.post('/upload', upload.single('image'), validate(schemas.claimUpload), ctrl.uploadImage);
router.post('/complete', validate(schemas.completeClaim), ctrl.completeClaim);
router.get('/results/:documentId', ctrl.getClaimResults);
router.get('/summarize/:documentId', ctrl.summarizeClaim);
router.post('/resubmit/:documentId', ctrl.resubmitClaim);

module.exports = router;
