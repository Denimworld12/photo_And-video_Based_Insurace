/**
 * Regression tests for upload handling.
 *
 * The stored filename used to take its extension from the client-supplied
 * original name. `uploads/` is served as static content, so a file declared as
 * `image/jpeg` but named `payload.html` was written as `.html` and then served
 * from the API's own origin.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const upload = require('../src/middleware/upload');
const { ALLOWED_TYPES } = upload;

const storedName = (file) =>
  new Promise((resolve, reject) => {
    upload.storage.getFilename({}, file, (err, name) => (err ? reject(err) : resolve(name)));
  });

const filterResult = (file) =>
  new Promise((resolve) => {
    // eslint-disable-next-line no-unused-vars
    upload.fileFilter({}, file, (err, accepted) => resolve({ err, accepted }));
  });

test('the stored extension comes from the media type, not the uploaded filename', async () => {
  const name = await storedName({ originalname: 'payload.html', mimetype: 'image/jpeg' });
  assert.ok(name.endsWith('.jpg'), `expected a .jpg file, got ${name}`);
  assert.ok(!name.includes('.html'), 'a client-supplied extension must never reach the uploads directory');
});

test('a double extension in the uploaded name is not carried over', async () => {
  const name = await storedName({ originalname: 'crop.jpg.php', mimetype: 'image/png' });
  assert.ok(name.endsWith('.png'), `expected a .png file, got ${name}`);
});

test('stored filenames are unpredictable', async () => {
  const file = { originalname: 'crop.jpg', mimetype: 'image/jpeg' };
  const names = new Set(await Promise.all([storedName(file), storedName(file), storedName(file)]));
  assert.strictEqual(names.size, 3, 'each upload must get its own unguessable name');
});

test('disallowed media types are refused', async () => {
  for (const mimetype of ['application/pdf', 'text/html', 'application/octet-stream', 'image/svg+xml']) {
    const { accepted } = await filterResult({ originalname: 'x', mimetype, fieldname: 'image' });
    assert.strictEqual(accepted, false, `${mimetype} must not be accepted`);
  }
});

test('the expected photo and video types are accepted', async () => {
  for (const mimetype of Object.keys(ALLOWED_TYPES)) {
    const { accepted } = await filterResult({ originalname: 'x', mimetype, fieldname: 'image' });
    assert.strictEqual(accepted, true, `${mimetype} should be accepted`);
  }
});

test('a media type differing only in case is still accepted', async () => {
  const { accepted } = await filterResult({ originalname: 'x', mimetype: 'IMAGE/JPEG', fieldname: 'image' });
  assert.strictEqual(accepted, true);
});

test('a server-side size limit is configured', () => {
  assert.ok(upload.MAX_FILE_SIZE > 0);
});
