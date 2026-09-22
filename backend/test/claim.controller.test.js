/**
 * Regression tests for the two claim inputs that silently scaled or corrupted a
 * payout: the sum insured a claim is measured against, and the capture location
 * the pipeline verifies the weather for.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  _resolveSumInsured: resolveSumInsured,
  _schemeMaxAmount: schemeMaxAmount,
  _pickCaptureCoordinates: pickCaptureCoordinates,
} = require('../src/controllers/claim.controller');
const { SEED_POLICIES } = require('../src/controllers/policy.controller');

test('a claim carrying no scheme still uses its policy coverage, not the default', async () => {
  // This is the production path: the claim form never collects a scheme, so
  // SubmitClaim posts scheme: ''. Treating that as unresolved sent every PMFBY
  // claim to DEFAULT_SUM_INSURED and paid it on half the quoted coverage.
  const pmfby = SEED_POLICIES.find((p) => p.code === 'PMFBY');

  for (const scheme of ['', undefined, null]) {
    const resolved = await resolveSumInsured({ insuranceId: pmfby._id, scheme });
    assert.strictEqual(resolved.sumInsured, pmfby.schemes[0].coverage.maxAmount, `scheme: ${String(scheme)}`);
    assert.strictEqual(resolved.source, 'seed:PMFBY');
  }

  const wbcis = SEED_POLICIES.find((p) => p.code === 'WBCIS');
  const byCode = await resolveSumInsured({ insuranceId: 'wbcis', scheme: '' });
  assert.strictEqual(byCode.sumInsured, wbcis.schemes[0].coverage.maxAmount);
  assert.strictEqual(byCode.source, 'seed:WBCIS');
});

test('a scheme code that matches selects that scheme on a multi-scheme policy', async () => {
  const policy = {
    _id: 'multi',
    code: 'MULTI',
    schemes: [
      { name: 'Basic', code: 'MULTI001', coverage: { maxAmount: 120000 } },
      { name: 'Extended', code: 'MULTI002', coverage: { maxAmount: 360000 } },
    ],
  };

  assert.strictEqual(schemeMaxAmount(policy, { scheme: 'MULTI002' }), 360000);
  assert.strictEqual(schemeMaxAmount(policy, { scheme: 'MULTI001' }), 120000);
});

test('a multi-scheme policy with no scheme match is unresolved rather than guessed', async () => {
  // Picking one of several would price the claim against coverage the farmer
  // never chose, and that figure multiplies straight into the payout.
  const policy = {
    _id: 'multi',
    code: 'MULTI',
    schemes: [
      { name: 'Basic', code: 'MULTI001', coverage: { maxAmount: 120000 } },
      { name: 'Extended', code: 'MULTI002', coverage: { maxAmount: 360000 } },
    ],
  };

  for (const scheme of ['', undefined, 'Basic', 'multi001', 'NOT-A-SCHEME']) {
    assert.strictEqual(schemeMaxAmount(policy, { scheme }), null, `scheme: ${String(scheme)}`);
  }
});

test('a single-scheme policy answers even when the claim names a different scheme', async () => {
  const pmfby = SEED_POLICIES.find((p) => p.code === 'PMFBY');
  assert.strictEqual(
    schemeMaxAmount(pmfby, { scheme: 'NOT-A-SCHEME' }),
    pmfby.schemes[0].coverage.maxAmount
  );
});

test('a policy carrying no usable coverage is unresolved', async () => {
  assert.strictEqual(schemeMaxAmount({ code: 'EMPTY', schemes: [] }, { scheme: '' }), null);
  assert.strictEqual(schemeMaxAmount({ code: 'NOCOV', schemes: [{ code: 'X' }] }, { scheme: '' }), null);
  assert.strictEqual(
    schemeMaxAmount({ code: 'ZERO', schemes: [{ code: 'X', coverage: { maxAmount: 0 } }] }, { scheme: '' }),
    null
  );
  assert.strictEqual(schemeMaxAmount(null, { scheme: '' }), null);
});

test('an unresolvable policy reference still falls back to the default sum insured', async () => {
  const { sumInsured, source } = await resolveSumInsured({ insuranceId: 'NOT-A-POLICY' });
  assert.strictEqual(sumInsured, Number(process.env.DEFAULT_SUM_INSURED) || 100000);
  assert.strictEqual(source, 'default');
});

test('a claim with no policy reference falls back to the default sum insured', async () => {
  const { sumInsured, source } = await resolveSumInsured({});
  assert.strictEqual(sumInsured, Number(process.env.DEFAULT_SUM_INSURED) || 100000);
  assert.strictEqual(source, 'default');
});

test('the (0,0) sentinel from a denied geolocation counts as no location', async () => {
  // Forwarding it made the pipeline verify the claim against Null Island's
  // weather, and that score feeds the automatic approve/reject decision.
  const { userLat, userLon } = pickCaptureCoordinates([
    { coordinates: { lat: 0, lon: 0 } },
    { coordinates: { lat: 0, lon: 0 } },
  ]);
  assert.strictEqual(userLat, null);
  assert.strictEqual(userLon, null);
});

test('a real capture location is used even when an earlier photo has none', () => {
  const { userLat, userLon } = pickCaptureCoordinates([
    { coordinates: { lat: 0, lon: 0 } },
    { coordinates: {} },
    { coordinates: { lat: 19.076, lon: 72.8777 } },
  ]);
  assert.strictEqual(userLat, 19.076);
  assert.strictEqual(userLon, 72.8777);
});

test('a genuine reading on the equator or the prime meridian is still a location', () => {
  assert.deepStrictEqual(pickCaptureCoordinates([{ coordinates: { lat: 0, lon: 72.8777 } }]), {
    userLat: 0,
    userLon: 72.8777,
  });
  assert.deepStrictEqual(pickCaptureCoordinates([{ coordinates: { lat: 19.076, lon: 0 } }]), {
    userLat: 19.076,
    userLon: 0,
  });
});

test('a claim with no evidence coordinates reports no location', () => {
  assert.deepStrictEqual(pickCaptureCoordinates([]), { userLat: null, userLon: null });
  assert.deepStrictEqual(pickCaptureCoordinates([{}, { coordinates: { lat: NaN, lon: NaN } }]), {
    userLat: null,
    userLon: null,
  });
});
