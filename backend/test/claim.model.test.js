/**
 * Regression tests for the Claim schema defaults that reviewers read as
 * measurements.
 *
 * Mongoose applies defaults when a document is constructed, so these run
 * without a database connection.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const Claim = require('../src/models/Claim');

const newClaim = () =>
  new Claim({
    documentId: 'CLM-00000000-AA',
    userId: new mongoose.Types.ObjectId(),
    cropType: 'wheat',
    farmArea: 2,
    lossReason: 'drought',
    lossDescription: 'crop dried out across the field',
  });

test('a claim nothing has measured carries no confidence score', () => {
  // A default of 0 was reported to reviewers as a measured 0% confidence on a
  // claim the pipeline had never run against.
  const claim = newClaim();
  assert.strictEqual(claim.confidenceScore, null);
  assert.notStrictEqual(claim.confidenceScore, 0);
});

test('a measured confidence score is stored as given, including a genuine zero', () => {
  const claim = newClaim();

  claim.confidenceScore = 0;
  assert.strictEqual(claim.confidenceScore, 0);

  claim.confidenceScore = 0.82;
  assert.strictEqual(claim.confidenceScore, 0.82);
});

test('a new claim starts with no payout and no verdict to report', () => {
  const claim = newClaim();
  assert.strictEqual(claim.payoutAmount, 0);
  assert.strictEqual(claim.payoutStatus, 'none');
  assert.strictEqual(claim.status, 'draft');
});
