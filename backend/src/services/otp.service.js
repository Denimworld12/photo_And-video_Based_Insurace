/**
 * OTP Service
 *
 * Currently runs in MOCK mode – any 4-6 digit OTP is accepted.
 * When ready for production, set OTP_MOCK_MODE=false in .env
 * and provide valid Twilio credentials.
 */

// ─── Twilio Placeholder ──────────────────────────────────────
// const twilio = require('twilio');
// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const otpStore = new Map(); // In production, use Redis

const isMockMode = () => process.env.OTP_MOCK_MODE !== 'false';

/**
 * Send OTP to a phone number.
 * In mock mode, generates a random OTP and stores it (but any OTP will be accepted).
 * In production, sends via Twilio SMS.
 */
const sendOTP = async (phoneNumber) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore.set(phoneNumber, { otp, expiresAt });

  if (isMockMode()) {
    console.log(`📱 [MOCK] OTP for ${phoneNumber}: ${otp}`);
    return { success: true, message: 'OTP sent (mock mode)', devOTP: otp };
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
  //   console.error('Twilio SMS failed:', err.message);
  //   throw new Error('Failed to send OTP via SMS');
  // }

  return { success: true, message: 'OTP sent' };
};

/**
 * Verify OTP for a phone number.
 * In mock mode, accepts ANY OTP input.
 * In production, validates against stored OTP.
 */
const verifyOTP = async (phoneNumber, otp) => {
  // Mock mode – accept any OTP
  if (isMockMode()) {
    console.log(`✅ [MOCK] OTP verified for ${phoneNumber} (any OTP accepted)`);
    otpStore.delete(phoneNumber);
    return { success: true, message: 'OTP verified (mock mode)' };
  }

  // Production mode – strict validation
  const stored = otpStore.get(phoneNumber);
  if (!stored) {
    return { success: false, error: 'OTP not found. Request a new one.' };
  }
  if (stored.expiresAt < Date.now()) {
    otpStore.delete(phoneNumber);
    return { success: false, error: 'OTP expired. Request a new one.' };
  }
  if (stored.otp !== otp) {
    return { success: false, error: 'Invalid OTP.' };
  }

  otpStore.delete(phoneNumber);
  return { success: true, message: 'OTP verified' };
};

module.exports = { sendOTP, verifyOTP, isMockMode };
