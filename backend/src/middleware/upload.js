const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Accepted media types, mapped to the extension the file is stored under.
 *
 * The stored extension comes from this table and never from the uploaded
 * filename. `uploads/` is served as static content, so honouring a client
 * supplied extension would let an upload declared as `image/jpeg` be written as
 * `.html` and then served from the API's own origin.
 */
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
};

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_TYPES[file.mimetype.toLowerCase()] || '.bin';
    // crypto.randomBytes rather than Math.random: the filename ends up in a
    // publicly reachable URL, so it should not be guessable from a timestamp.
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const mimeType = file.mimetype.toLowerCase();
  if (!ALLOWED_TYPES[mimeType]) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    // Bound the non-file multipart fields as well, so a request cannot arrive
    // with megabytes of text fields under the file-size limit.
    fields: 20,
    fieldSize: 64 * 1024,
  },
  fileFilter,
});

module.exports = upload;
module.exports.ALLOWED_TYPES = ALLOWED_TYPES;
module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
