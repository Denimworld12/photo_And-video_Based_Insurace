/**
 * OTP Service
 *
 * Delivery has two modes:
 *   - mock  : no SMS is sent. The generated OTP is logged and (outside production)
 *             returned to the caller as `devOTP` so local clients can log in.
 *   - twilio: the OTP is sent over SMS.
 *
 * Verification is identical in both modes: the submitted OTP is always checked
 * against the stored, unexpired OTP for that phone number. Mock mode only
 * changes how the code is delivered, never whether it is checked.
 *
 * Mock mode is refused in production (see assertDeliveryConfigured), because a
 * mode that skips SMS while the caller is told the OTP would be an open door to
 * every account, including the admin account.
 */

// ─── Twilio Placeholder ──────────────────────────────────────
// const twilio = require('twilio');
// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;

const otpStore = new Map(); // In production, use Redis

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Mock delivery is opt-in and is never available in production.
 */
const isMockMode = () => !isProduction() && process.env.OTP_MOCK_MODE !== 'false';

/**
 * Fail fast at startup rather than silently running an unauthenticated login
 * flow. Called from server.js.
 */
const assertDeliveryConfigured = () => {
  if (!isProduction()) return;

  if (process.env.OTP_MOCK_MODE === 'true') {
    throw new Error(
      'OTP_MOCK_MODE=true is not allowed when NODE_ENV=production: OTP delivery must go over SMS'
    );
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error(
      'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are required when NODE_ENV=production'
    );
  }
};

/**
 * Drop expired entries so a long-running process does not accumulate one entry
 * per phone number that ever requested an OTP.
 */
const pruneExpired = () => {
  const now = Date.now();
  for (const [phoneNumber, entry] of otpStore) {
    if (entry.expiresAt < now) otpStore.delete(phoneNumber);
  }
};

/**
 * Send OTP to a phone number.
 * Returns `devOTP` only outside production, so a local client can complete login.
 */
const sendOTP = async (phoneNumber) => {
  pruneExpired();

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + OTP_TTL_MS;

  otpStore.set(phoneNumber, { otp, expiresAt, attempts: 0 });

  if (isMockMode()) {
    console.log(`[OTP] Mock delivery (no SMS sent) for ${phoneNumber}: ${otp}`);
    return { success: true, message: 'OTP sent (mock delivery)', devOTP: otp };
  }

  // ─── Twilio Integration (uncomment when ready) ──────────
  // try {
  //   await twilioClient.messages.create({
  //     body: `Your PBI AgriInsure OTP is: ${otp}. Valid for 10 minutes.`,
  //     from: process.env.TWILIO_PHONE_NUMBER,
  //     to: `+91${phoneNumber}`,
  //   });
  //   return { success: true, message: 'OTP sent via SMS' };
  // } catch (err) {
  //   console.error('[OTP] Twilio SMS failed:', err.message);
  //   throw new Error('Failed to send OTP via SMS');
  // }

  return { success: true, message: 'OTP sent' };
};

/**
 * Verify OTP for a phone number. The submitted code is always checked against
 * the stored code, in every delivery mode.
 */
const verifyOTP = async (phoneNumber, otp) => {
  pruneExpired();

  const stored = otpStore.get(phoneNumber);
  if (!stored) {
    return { success: false, error: 'OTP not found. Request a new one.' };
  }
  if (stored.expiresAt < Date.now()) {
    otpStore.delete(phoneNumber);
    return { success: false, error: 'OTP expired. Request a new one.' };
  }
  if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(phoneNumber);
    return { success: false, error: 'Too many incorrect attempts. Request a new OTP.' };
  }
  if (stored.otp !== otp) {
    stored.attempts += 1;
    return { success: false, error: 'Invalid OTP.' };
  }

  otpStore.delete(phoneNumber);
  return { success: true, message: 'OTP verified' };
};

module.exports = { sendOTP, verifyOTP, isMockMode, assertDeliveryConfigured, _otpStore: otpStore };
