// ---------------------------------------------------------------------------
// Sends the early-warning SMS when a user's stress level crosses the
// threshold. Uses Twilio if credentials are set in .env, otherwise falls
// back to "stub mode" — it just logs what WOULD have been sent, so the
// rest of the app (dashboard, alert log, cooldown logic) still works
// end-to-end without needing a paid SMS account during development.
// ---------------------------------------------------------------------------

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

const twilioConfigured = Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

let twilioClient = null;
if (twilioConfigured) {
  try {
    // Only required if the dependency is installed and credentials are set.
    const twilio = require("twilio");
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
  } catch (err) {
    console.warn(
      "Twilio credentials are set but the 'twilio' package isn't installed. " +
        "Run `npm install twilio` to enable real SMS sending. Falling back to stub mode."
    );
  }
}

async function sendStressAlert(phone, level) {
  const message = `MindPlay alert: your stress level just hit ${level.toFixed(
    1
  )}/10. Consider taking a short break.`;

  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: TWILIO_FROM,
        to: phone,
      });
      return { sent: true };
    } catch (err) {
      console.error("Twilio SMS failed:", err.message);
      return { sent: false, reason: "SMS provider error." };
    }
  }

  // Stub mode — no SMS provider configured.
  console.log(`[SMS stub] Would text ${phone}: "${message}"`);
  return { sent: false, reason: "SMS not configured (running in stub mode)." };
}

module.exports = { sendStressAlert };
