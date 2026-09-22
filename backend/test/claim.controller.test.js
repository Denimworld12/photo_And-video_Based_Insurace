/**
 * Regression tests for the two claim inputs that silently scaled or corrupted a
 * payout: the sum insured a claim is measured against, and the capture location
 * the pipeline verifies the weather for.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const { _resolveSumInsured: resolveSumInsured, _pickCaptureCoordinates: pickCaptureCoordinates } =
  require('../src/controllers/claim.controller');
const { SEED_POLICIES } = require('../src/controllers/policy.controller');

test('a claim filed against a seed policy uses that policy coverage, not the default', async () => {
  // The farmer portal serves SEED_POLICIES whenever the Policy collection is
  // empty, and their _id values reach the claim as insuranceId. Falling back to
  // DEFAULT_SUM_INSURED paid PMFBY claims on half the quoted coverage.
  const pmfby = SEED_POLICIES.find((p) => p.code === 'PMFBY');

  const byId = await resolveSumInsured({ insuranceId: pmfby._id, scheme: pmfby.schemes[0].code });
  assert.strictEqual(byId.sumInsured, pmfby.schemes[0].coverage.maxAmount);
  assert.strictEqual(byId.source, 'seed:PMFBY');

  const wbcis = SEED_POLICIES.find((p) => p.code === 'WBCIS');
  const byCode = await resolveSumInsured({ insuranceId: 'wbcis', scheme: wbcis.schemes[0].code });
  assert.strictEqual(byCode.sumInsured, wbcis.schemes[0].coverage.maxAmount);
  assert.strictEqual(byCode.source, 'seed:WBCIS');
});

test('a scheme that matches no scheme on the policy is unresolved, not the first one', async () => {
  // claim.scheme is free text. Falling through to policy.schemes[0] priced a
  // mistyped or blank scheme against coverage the farmer never chose, and that
  // figure multiplies straight into the payout.
  const pmfby = SEED_POLICIES.find((p) => p.code === 'PMFBY');
  const fallback = Number(process.env.DEFAULT_SUM_INSURED) || 100000;

  for (const scheme of ['', undefined, 'PMFBY Basic Coverage', 'pmfby001', 'NOT-A-SCHEME']) {
    const resolved = await resolveSumInsured({ insuranceId: pmfby._id, scheme });
    assert.strictEqual(resolved.sumInsured, fallback, `scheme: ${String(scheme)}`);
    assert.strictEqual(resolved.source, 'default');
  }
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
