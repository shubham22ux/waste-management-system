import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';
import { saveUserToMongo } from '../services/mongoSync.js';
import { sendOtpEmail } from '../services/emailService.js';

const router = express.Router();

const ADMIN_DESTINATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'shubhamkumar040605@gmail.com';

/**
 * Masks an email for safe display (e.g. shubhamkumar040605@gmail.com -> s***5@gmail.com)
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  const first = local.slice(0, 2);
  const last = local.slice(-1);
  return `${first}${'*'.repeat(Math.max(local.length - 3, 3))}${last}@${domain}`;
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

// POST /api/auth/request-otp - Generates and dispatches OTP for login
router.post('/request-otp', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user account
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    // Fallback: If user entered default admin address or admin shubham email
    if (!user && (normalizedEmail === 'admin@smartwaste.gov' || normalizedEmail === ADMIN_DESTINATION_EMAIL.toLowerCase())) {
      user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    }

    if (!user) {
      return res.status(404).json({
        error: 'No account registered with this email. If you are a driver, please contact your Municipal Admin to register your email.'
      });
    }

    // If password was supplied, verify it
    if (password) {
      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
      }
    }

    // Determine target recipient email strictly per business rules:
    // 1. Admin OTP always goes to shubhamkumar040605@gmail.com
    // 2. Driver OTP goes to the driver's registered email (provided by admin)
    // 3. Citizen OTP goes to the citizen's registered email
    let targetEmail = user.email;
    if (user.role === 'admin' || normalizedEmail === ADMIN_DESTINATION_EMAIL.toLowerCase() || normalizedEmail === 'admin@smartwaste.gov') {
      targetEmail = ADMIN_DESTINATION_EMAIL;
    }

    // Expire any existing pending OTPs for this account
    db.prepare('UPDATE otps SET used = 1 WHERE email = ? AND used = 0').run(user.email);

    // Generate cryptographically random 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to otps table (valid for 10 minutes)
    db.prepare(`
      INSERT INTO otps (email, target_email, otp, role, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'))
    `).run(user.email, targetEmail, otp, user.role);

    // Dispatch OTP via email service
    await sendOtpEmail({
      to: targetEmail,
      otp,
      role: user.role,
      userName: user.name
    });

    res.json({
      success: true,
      requireOtp: true,
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

// POST /api/auth/verify-otp - Verifies the 6-digit OTP and authenticates user
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Both email and 6-digit OTP are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

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

// POST /api/auth/login - Legacy / Password-initiated login (triggers OTP step for Admin and Driver)
router.post('/login', async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // If OTP is already supplied in this request, verify it directly
    if (otp) {
      const cleanOtp = otp.toString().trim();
      const otpRecord = db.prepare(`
        SELECT * FROM otps
        WHERE (email = ? OR target_email = ?)
          AND otp = ?
          AND used = 0
          AND expires_at > datetime('now')
        ORDER BY id DESC LIMIT 1
      `).get(normalizedEmail, normalizedEmail, cleanOtp);

      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid or expired OTP code.' });
      }

      db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otpRecord.id);

      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(otpRecord.email);
      if (!user) {
        user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
      }

      const userPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      };

      const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: userPayload });
    }

    // Otherwise check password
    if (!password) {
      return res.status(400).json({ error: 'Email and password (or OTP) are required.' });
    }

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user && (normalizedEmail === 'admin@smartwaste.gov' || normalizedEmail === ADMIN_DESTINATION_EMAIL.toLowerCase())) {
      user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Role requires OTP verification:
    // Admin & Driver mandate OTP email verification.
    if (user.role === 'admin' || user.role === 'driver') {
      let targetEmail = user.email;
      if (user.role === 'admin' || normalizedEmail === ADMIN_DESTINATION_EMAIL.toLowerCase() || normalizedEmail === 'admin@smartwaste.gov') {
        targetEmail = ADMIN_DESTINATION_EMAIL;
      }

      db.prepare('UPDATE otps SET used = 1 WHERE email = ? AND used = 0').run(user.email);
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

      db.prepare(`
        INSERT INTO otps (email, target_email, otp, role, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'))
      `).run(user.email, targetEmail, generatedOtp, user.role);

      await sendOtpEmail({
        to: targetEmail,
        otp: generatedOtp,
        role: user.role,
        userName: user.name
      });

      return res.json({
        requireOtp: true,
        email: user.email,
        maskedEmail: maskEmail(targetEmail),
        role: user.role,
        message: `Verification code dispatched to ${maskEmail(targetEmail)}.`
      });
    }

    // Citizen direct password fallback
    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: userPayload });
  } catch (err) {
    console.error('Login error:', err);
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
