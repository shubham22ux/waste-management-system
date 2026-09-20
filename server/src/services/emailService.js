import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Brevo (Sendinblue) SMTP Configuration — Primary
const BREVO_SMTP_KEY = process.env.BREVO_SMTP_KEY || '';
const BREVO_SMTP_HOST = 'smtp-relay.brevo.com';
const BREVO_SMTP_PORT = 587;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.ADMIN_NOTIFICATION_EMAIL || 'shubhamkumar040605@gmail.com';

// Gmail fallback
const GMAIL_USER = process.env.GMAIL_USER || process.env.ADMIN_NOTIFICATION_EMAIL || 'shubhamkumar040605@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

function createTransporter(type) {
  if (type === 'brevo' && BREVO_SMTP_KEY) {
    return nodemailer.createTransport({
      host: BREVO_SMTP_HOST,
      port: BREVO_SMTP_PORT,
      secure: false,
      auth: {
        user: BREVO_SENDER_EMAIL,
        pass: BREVO_SMTP_KEY
      }
    });
  }

  if (type === 'gmail' && GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
      }
    });
  }

  if (type === 'oauth2' && GOOGLE_REFRESH_TOKEN) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        refreshToken: GOOGLE_REFRESH_TOKEN
      }
    });
  }

  if (type === 'smtp' && process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return null;
}

/**
 * Gets configured transporters in priority order
 */
function getTransporterList() {
  const list = [];
  // If Gmail App Password is provided, test/prioritize or use as primary/fallback
  if (BREVO_SMTP_KEY) list.push({ name: 'Brevo SMTP', sender: BREVO_SENDER_EMAIL, transport: createTransporter('brevo') });
  if (GMAIL_APP_PASSWORD) list.push({ name: 'Gmail App Password', sender: GMAIL_USER, transport: createTransporter('gmail') });
  if (GOOGLE_REFRESH_TOKEN) list.push({ name: 'Gmail OAuth2', sender: GMAIL_USER, transport: createTransporter('oauth2') });
  if (process.env.SMTP_HOST) list.push({ name: 'Generic SMTP', sender: process.env.SMTP_USER, transport: createTransporter('smtp') });
  return list;
}

/**
 * Sends an OTP email to the recipient.
 * @param {Object} params
 * @param {string} params.to - Target recipient email
 * @param {string} params.otp - 6-digit OTP code
 * @param {string} params.role - User role ('admin', 'driver', 'citizen')
 * @param {string} [params.userName] - Recipient's display name
 * @returns {Promise<{ success: boolean, delivered: boolean, note?: string }>}
 */
export async function sendOtpEmail({ to, otp, role, userName = 'User' }) {
  const roleTitle = role.toUpperCase();
  const expiresMinutes = 10;

  // Always log to server terminal for developer visibility
  console.log('\n======================================================================');
  console.log(`📨 [SMARTWASTE OTP DISPATCH]`);
  console.log(`   To       : ${to}`);
  console.log(`   Role     : ${roleTitle}`);
  console.log(`   OTP Code : >>> ${otp} <<<`);
  console.log(`   Validity : ${expiresMinutes} minutes`);
  console.log('======================================================================\n');

  const transporters = getTransporterList();

  if (transporters.length === 0) {
    console.warn('[Email] No email transport configured. OTP logged to terminal only.');
    return {
      success: true,
      delivered: false,
      note: 'Email transport not configured. Code logged to terminal.'
    };
  }

  let lastError = null;

  for (const item of transporters) {
    try {
      console.log(`[Email] Attempting delivery via ${item.name}...`);
      const mailOptions = {
        from: `"SmartWaste Security" <${item.sender}>`,
        to,
        subject: `[SmartWaste] Your Login Verification Code: ${otp}`,
        text: `Hello ${userName},\n\nYour SmartWaste one-time verification code for ${roleTitle} login is: ${otp}\n\nThis code will expire in ${expiresMinutes} minutes.\n\nIf you did not request this login code, please ignore this email.\n\nRegards,\nSmartWaste Municipal System`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #065f46 0%, #0f766e 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Smart<span style="color: #5eead4;">Waste</span></h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #a7f3d0;">Municipal Waste & Route Optimization System</p>
            </div>
            
            <div style="padding: 28px 24px;">
              <div style="display: inline-block; padding: 4px 12px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 9999px; font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; margin-bottom: 12px;">
                ${roleTitle} Authentication
              </div>
              <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a; font-weight: 700;">Login Verification Code</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.5;">
                Hello <strong>${userName}</strong>,<br>
                Please enter the following 6-digit one-time password (OTP) to complete your sign-in to the SmartWaste portal:
              </p>
              
              <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0f766e; font-family: monospace;">
                  ${otp}
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
                  Valid for the next <strong>${expiresMinutes} minutes</strong>
                </div>
              </div>
              
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; line-height: 1.4;">
                If you did not initiate this login request, please disregard this email or notify your system administrator immediately.
              </p>
            </div>
            
            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
              SmartWaste IoT & Route Optimization Infrastructure &bull; Automated Security Dispatch
            </div>
          </div>
        `
      };

      await item.transport.sendMail(mailOptions);
      console.log(`✅ [OTP] Email successfully delivered to ${to} via ${item.name}`);
      return { success: true, delivered: true };
    } catch (err) {
      console.warn(`⚠️ [OTP] ${item.name} failed (${err.message}). Trying fallback if available...`);
      lastError = err;
    }
  }

  console.warn(`❌ [OTP] All email transports failed (${lastError?.message}). Code logged to terminal.`);
  return {
    success: true,
    delivered: false,
    note: `Email dispatch failed (${lastError?.message}). Code is available in server terminal.`
  };
}
