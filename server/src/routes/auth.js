import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db/index.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';
import { saveUserToMongo } from '../services/mongoSync.js';
import { sendOtpEmail } from '../services/emailService.js';

const router = express.Router();

const ADMIN_EMAIL = (process.env.ADMIN_NOTIFICATION_EMAIL || 'shubhamkumar040605@gmail.com').toLowerCase();

// Temp token secret for OTP flow (separate from JWT_SECRET for isolation)
const TEMP_TOKEN_SECRET = process.env.JWT_SECRET
  ? process.env.JWT_SECRET + '_otp_temp'
  : 'smartwaste_temp_otp_secret_2026';

/**
 * Masks an email for safe display (e.g. shubhamkumar040605@gmail.com -> sh***5@gmail.com)
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  const first = local.slice(0, 2);
  const last = local.slice(-1);
  return `${first}${'*'.repeat(Math.max(local.length - 3, 3))}${last}@${domain}`;
}

/**
 * Generates a temporary token for OTP verification step.
 * This token is short-lived (10 minutes) and encodes the user's email and role
 * so the OTP verification step can confirm identity.
 */
function generateTempToken(email, role) {
  return jwt.sign(
    { email, role, purpose: 'otp_verification' },
    TEMP_TOKEN_SECRET,
    { expiresIn: '10m' }
  );
}

/**
 * Verifies a temp token and returns decoded payload or null.
 */
function verifyTempToken(token) {
  try {
    const decoded = jwt.verify(token, TEMP_TOKEN_SECRET);
    if (decoded.purpose !== 'otp_verification') return null;
    return decoded;
  } catch {
    return null;
  }
}

// POST /api/auth/register - Citizen Self-Registration
router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (role && role !== 'citizen') {
      return res.status(403).json({
        error: 'Drivers and staff cannot self-register. Driver accounts must be created and issued by a municipal administrator.'
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone)
      VALUES (?, ?, ?, 'citizen', ?)
    `);

    const info = stmt.run(name.trim(), normalizedEmail, passwordHash, phone ? phone.trim() : null);
    const userId = info.lastInsertRowid;

    saveUserToMongo({
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'citizen',
      phone: phone ? phone.trim() : null,
      created_at: new Date().toISOString()
    });

    const userPayload = { id: userId, name: name.trim(), email: normalizedEmail, role: 'citizen', phone: phone ? phone.trim() : null };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: userPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Unified login endpoint with role-separated behavior
//
// Flow:
//   CITIZEN  → password check → direct JWT token (no OTP)
//   ADMIN    → password check → OTP sent ONLY to shubhamkumar040605@gmail.com → returns tempToken + requireOtp
//   DRIVER   → password check → check approved_driver_emails → OTP sent to driver email → returns tempToken + requireOtp
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    // Fallback: admin login aliases
    if (!user && (normalizedEmail === 'admin@smartwaste.gov' || normalizedEmail === ADMIN_EMAIL)) {
      user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Direct password login for all roles (Admin, Driver, Citizen) - No OTP required
    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: userPayload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp - Verifies the 6-digit OTP using the temp token
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp, tempToken } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Both email and 6-digit OTP are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    // Verify temp token if provided (recommended for security)
    if (tempToken) {
      const decoded = verifyTempToken(tempToken);
      if (!decoded) {
        return res.status(401).json({ error: 'Session expired. Please log in again from the credentials step.' });
      }
      // Ensure the temp token email matches the OTP request email
      if (decoded.email.toLowerCase() !== normalizedEmail) {
        return res.status(401).json({ error: 'Session mismatch. Please log in again.' });
      }
    }

    // Find valid matching OTP
    const otpRecord = db.prepare(`
      SELECT * FROM otps
      WHERE (email = ? OR target_email = ?)
        AND otp = ?
        AND used = 0
        AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(normalizedEmail, normalizedEmail, cleanOtp);

    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid or expired OTP code. Please check the code or request a new one.'
      });
    }

    // Mark OTP as consumed
    db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otpRecord.id);

    // Fetch user details
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(otpRecord.email);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(otpRecord.target_email);
    }
    if (!user && otpRecord.role === 'admin') {
      user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    }

    if (!user) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: userPayload
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/request-otp - Resend OTP (used for the "Resend OTP" button)
router.post('/request-otp', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user account
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user && (normalizedEmail === 'admin@smartwaste.gov' || normalizedEmail === ADMIN_EMAIL)) {
      user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    }

    if (!user) {
      return res.status(404).json({
        error: 'No account registered with this email.'
      });
    }

    // If password was supplied, verify it
    if (password) {
      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password.' });
      }
    }

    // Determine target email
    let targetEmail = user.email;
    if (user.role === 'admin') {
      targetEmail = ADMIN_EMAIL;
    }

    // Expire old OTPs
    db.prepare('UPDATE otps SET used = 1 WHERE email = ? AND used = 0').run(user.email);

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    db.prepare(`
      INSERT INTO otps (email, target_email, otp, role, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'))
    `).run(user.email, targetEmail, otpCode, user.role);

    // Send OTP email
    await sendOtpEmail({ to: targetEmail, otp: otpCode, role: user.role, userName: user.name });

    // Generate fresh temp token
    const tempToken = generateTempToken(user.email, user.role);

    res.json({
      success: true,
      requireOtp: true,
      tempToken,
      email: user.email,
      maskedEmail: maskEmail(targetEmail),
      role: user.role,
      message: `A 6-digit verification code has been dispatched to ${maskEmail(targetEmail)}.`
    });
  } catch (err) {
    console.error('Request OTP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Get current user from token
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
