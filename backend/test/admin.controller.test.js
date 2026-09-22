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

const { _resolveApprovedPayout: resolveApprovedPayout } = require('../src/controllers/admin.controller');

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

test('a failed pipeline run approves no payout on its own', () => {
  // fallbackResult carries payout_amount 0, which must stay 0 rather than
  // resolving to some earlier figure.
  assert.strictEqual(resolveApprovedPayout(manualReviewClaim(0), undefined), 0);
});
