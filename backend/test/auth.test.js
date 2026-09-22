/**
 * Regression tests for the login path.
 *
 * The OTP service previously accepted ANY code whenever OTP_MOCK_MODE was not
 * explicitly 'false' - which was the default - so anyone could log in as any
 * phone number, including the admin number.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

// Loaded fresh so module-level env reads are re-evaluated per test.
const loadOtpService = () => {
  delete require.cache[require.resolve('../src/services/otp.service')];
  return require('../src/services/otp.service');
};

test('a wrong OTP is rejected in mock delivery mode', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    await otp.sendOTP('9876543210');

    const result = await otp.verifyOTP('9876543210', '000000');
    assert.strictEqual(result.success, false, 'mock mode must not accept an arbitrary OTP');
  });
});

test('the issued OTP is accepted in mock delivery mode', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    const { devOTP } = await otp.sendOTP('9876543210');

    assert.ok(devOTP, 'mock delivery returns the code so a local client can log in');
    assert.strictEqual((await otp.verifyOTP('9876543210', devOTP)).success, true);
  });
});

test('an OTP cannot be replayed after a successful verification', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    const { devOTP } = await otp.sendOTP('9876543210');

    assert.strictEqual((await otp.verifyOTP('9876543210', devOTP)).success, true);
    assert.strictEqual((await otp.verifyOTP('9876543210', devOTP)).success, false);
  });
});

test('verification without a prior send is rejected', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    assert.strictEqual((await otp.verifyOTP('9000000001', '123456')).success, false);
  });
});

test('repeated wrong guesses lock the code out', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    const { devOTP } = await otp.sendOTP('9876543211');

    for (let i = 0; i < 5; i += 1) await otp.verifyOTP('9876543211', '000000');

    // Even the correct code no longer works after the attempt budget is spent.
    assert.strictEqual((await otp.verifyOTP('9876543211', devOTP)).success, false);
  });
});

test('an expired OTP is rejected', async () => {
  await withEnv({ NODE_ENV: 'development', OTP_MOCK_MODE: 'true' }, async () => {
    const otp = loadOtpService();
    const { devOTP } = await otp.sendOTP('9876543212');

    otp._otpStore.get('9876543212').expiresAt = Date.now() - 1;
    assert.strictEqual((await otp.verifyOTP('9876543212', devOTP)).success, false);
  });
});

test('mock delivery is not active in production', async () => {
  await withEnv({ NODE_ENV: 'production', OTP_MOCK_MODE: 'true' }, () => {
    const otp = loadOtpService();
    assert.strictEqual(otp.isMockMode(), false);
  });
});

test('startup is refused when production is configured for mock delivery', async () => {
  await withEnv({ NODE_ENV: 'production', OTP_MOCK_MODE: 'true' }, () => {
    const otp = loadOtpService();
    assert.throws(() => otp.assertDeliveryConfigured(), /not allowed/);
  });
});

test('startup is refused in production without Twilio credentials', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_MOCK_MODE: 'false',
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_PHONE_NUMBER: undefined,
    },
    () => {
      const otp = loadOtpService();
      assert.throws(() => otp.assertDeliveryConfigured(), /Twilio credentials/);
    }
  );
});
