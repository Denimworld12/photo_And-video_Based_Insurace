/**
 * Regression tests for the payout an admin approval records.
 *
 * A claim routed to manual_review is persisted with payoutAmount 0, so an
 * approval that carried no amount used to approve the farmer for nothing.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  _resolveApprovedPayout: resolveApprovedPayout,
  _reviewMessage: reviewMessage,
} = require('../src/controllers/admin.controller');
const { fallbackResult } = require('../src/services/python.service');

const manualReviewClaim = (payoutAmount) => ({
  status: 'manual_review',
  payoutAmount: 0,
  processingResult: { payout_calculation: { payout_amount: payoutAmount } },
});

test('approving without an amount adopts the figure the pipeline calculated', () => {
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(60000), undefined), 60000);
});

test('an amount the admin typed always wins, including an explicit zero', () => {
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(60000), 45000), 45000);
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(60000), 0), 0);
});

test('a claim the pipeline never assessed resolves to no figure at all', () => {
  // reviewClaim turns this into a 400 asking for an explicit amount. Settling
  // on 0 here approved a farmer for nothing and notified them it was approved.
  assert.strictEqual(resolveApprovedPayout({ payoutAmount: 30000 }, undefined), null);
  assert.strictEqual(resolveApprovedPayout({ processingResult: {} }, undefined), null);
  assert.strictEqual(
    resolveApprovedPayout({ payoutAmount: 30000, processingResult: { payout_calculation: {} } }, undefined),
    null
  );
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim('lots'), undefined), null);
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(-1), undefined), null);
});

test('an explicit amount approves a claim the pipeline never assessed', () => {
  assert.strictEqual(resolveApprovedPayout({ processingResult: {} }, 50000), 50000);
  assert.strictEqual(resolveApprovedPayout({ processingResult: {} }, 0), 0);
});

test('a claim whose pipeline failed has no figure, despite carrying a zero', () => {
  // This is how most claims reach the admin queue. fallbackResult persists
  // payout_amount 0 as a stand-in for "nothing was measured", and Number(0) is
  // finite - so a guard that only checked for a missing figure let the claim be
  // approved for nothing and notified the farmer it was approved.
  const failedClaim = {
    status: 'manual_review',
    payoutAmount: 0,
    processingResult: fallbackResult('Pipeline timed out after 120000 ms', 'timeout'),
  };

  assert.strictEqual(failedClaim.processingResult.pipeline_failed, true);
  assert.strictEqual(failedClaim.processingResult.payout_calculation.payout_amount, 0);
  assert.strictEqual(resolveApprovedPayout(failedClaim, undefined), null);
});

test('an explicit amount still approves a claim whose pipeline failed', () => {
  const failedClaim = { processingResult: fallbackResult('no photo evidence', 'no_input') };

  assert.strictEqual(resolveApprovedPayout(failedClaim, 75000), 75000);
  assert.strictEqual(resolveApprovedPayout(failedClaim, 0), 0);
});

test('a completed run that measured a zero payout still resolves to zero', () => {
  // A successful assessment that lands on 0 is a real measurement, unlike the
  // fallback's stand-in, so it needs no second opinion from the admin.
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(0), undefined), 0);
});

test('the default approval notice tells a zero-payout approval apart from a paid one', () => {
  assert.match(reviewMessage('CLM-1', 'approved', 45000), /payout of INR 45,000/);
  assert.match(reviewMessage('CLM-1', 'approved', 0), /approved with no payout due/);
  assert.strictEqual(reviewMessage('CLM-1', 'rejected', 0), 'Your claim CLM-1 has been rejected.');
});
