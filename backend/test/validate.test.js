/**
 * Regression tests for request validation.
 *
 * The upload endpoint previously took `lat`/`lon`/`step_id` straight from the
 * multipart body with no schema, so a claim could be stored with NaN
 * coordinates or an unset step id.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const { schemas, validateObjectId } = require('../src/middleware/validate');

const runMiddleware = (middleware, req) => {
  let nextCalled = false;
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
};

test('claimUpload requires coordinates', () => {
  const { error } = schemas.claimUpload.validate({ parcel_id: 'CLM-1', step_id: 'corner_1' });
  assert.ok(error, 'coordinates must not be optional');
});

test('claimUpload rejects non-numeric coordinates', () => {
  const { error } = schemas.claimUpload.validate({
    parcel_id: 'CLM-1',
    step_id: 'corner_1',
    lat: 'not-a-number',
    lon: '72.8',
  });
  assert.ok(error, 'a non-numeric latitude must be rejected, not stored as NaN');
});

test('claimUpload rejects out-of-range coordinates', () => {
  const { error } = schemas.claimUpload.validate({
    parcel_id: 'CLM-1',
    step_id: 'corner_1',
    lat: '95',
    lon: '72.8',
  });
  assert.ok(error, 'latitude beyond 90 degrees must be rejected');
});

test('claimUpload requires a step id', () => {
  const { error } = schemas.claimUpload.validate({ parcel_id: 'CLM-1', lat: '19.1', lon: '72.8' });
  assert.ok(error, 'stepId is required by the Claim schema, so it must be validated here');
});

test('claimUpload coerces the multipart strings to numbers', () => {
  const { error, value } = schemas.claimUpload.validate({
    parcel_id: 'CLM-1',
    step_id: 'corner_1',
    lat: '19.1',
    lon: '72.8',
  });
  assert.strictEqual(error, undefined);
  assert.strictEqual(value.lat, 19.1);
  assert.strictEqual(value.lon, 72.8);
  assert.strictEqual(value.media_type, 'photo');
});

test('verifyOtp requires a six-digit numeric code', () => {
  assert.ok(schemas.verifyOtp.validate({ phoneNumber: '9876543210', otp: 'abcdef' }).error);
  assert.strictEqual(schemas.verifyOtp.validate({ phoneNumber: '9876543210', otp: '123456' }).error, undefined);
});

test('updateProfile cannot set role, phone number or active flag', () => {
  const { value } = schemas.updateProfile.validate(
    { fullName: 'A Farmer', role: 'admin', isActive: true, phoneNumber: '9000000000' },
    { stripUnknown: true }
  );
  assert.strictEqual(value.role, undefined, 'role must not be settable through the profile endpoint');
  assert.strictEqual(value.isActive, undefined);
  assert.strictEqual(value.phoneNumber, undefined);
});

test('createPolicy requires a name and a code', () => {
  assert.ok(schemas.createPolicy.validate({ premiumRate: 2 }).error);
  assert.strictEqual(schemas.createPolicy.validate({ name: 'PMFBY', code: 'PMFBY' }).error, undefined);
});

test('updatePolicy rejects an empty body', () => {
  assert.ok(schemas.updatePolicy.validate({}).error);
  assert.strictEqual(schemas.updatePolicy.validate({ premiumRate: 3 }).error, undefined);
});

test('adminReview accepts a payout of zero', () => {
  // `if (payoutAmount)` treated 0 as "not supplied"; the schema must allow it.
  const { error, value } = schemas.adminReview.validate({ status: 'approved', payoutAmount: 0 });
  assert.strictEqual(error, undefined);
  assert.strictEqual(value.payoutAmount, 0);
});

test('validateObjectId rejects a malformed id with 400, not a 500', () => {
  const { nextCalled, res } = runMiddleware(validateObjectId('id'), { params: { id: 'not-an-object-id' } });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
});

test('validateObjectId passes a well-formed id through', () => {
  const { nextCalled } = runMiddleware(validateObjectId('id'), { params: { id: '507f1f77bcf86cd799439011' } });
  assert.strictEqual(nextCalled, true);
});
