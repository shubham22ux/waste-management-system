import express from 'express';
import db from '../db/index.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { saveDriverToMongo } from '../services/mongoSync.js';
import { haversineDistanceKm } from '../utils/distance.js';

const router = express.Router();
const getIo = (req) => req.app.get('io');

const driverSelectQuery = `
  SELECT 
    d.id,
    d.user_id,
    u.name,
    u.email,
    u.phone,
    d.license_number,
    d.assigned_vehicle_id,
    v.plate_number AS vehicle_plate,
    v.model AS vehicle_model,
    d.availability,
    d.currentLatitude,
    d.currentLongitude,
    d.locationUpdatedAt
  FROM drivers d
  JOIN users u ON d.user_id = u.id
  LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
`;

// GET /api/drivers - List all drivers
router.get('/', (req, res) => {
  try {
    const { availability } = req.query;
    let sql = driverSelectQuery + ' WHERE 1=1';
    const params = [];

    if (availability) {
      sql += ' AND d.availability = ?';
      params.push(availability);
    }

    sql += ' ORDER BY d.id ASC';
    const drivers = db.prepare(sql).all(...params);
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/locations - Admin views all drivers' current locations (admin role only)
router.get('/locations', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const drivers = db.prepare(`
      SELECT 
        d.id,
        u.name,
        u.phone,
        d.availability,
        v.plate_number AS vehicle_plate,
        d.currentLatitude,
        d.currentLongitude,
        d.locationUpdatedAt,
        (
          SELECT r.name 
          FROM routes r 
          WHERE r.driver_id = d.id AND r.status IN ('planned', 'in_progress') 
          ORDER BY r.id DESC 
          LIMIT 1
        ) AS current_task
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      ORDER BY d.id ASC
    `).all();

    const formatted = drivers.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      availability: d.availability,
      vehicle_plate: d.vehicle_plate,
      vehiclePlate: d.vehicle_plate,
      currentLatitude: d.currentLatitude,
      currentLongitude: d.currentLongitude,
      current_latitude: d.currentLatitude,
      current_longitude: d.currentLongitude,
      locationUpdatedAt: d.locationUpdatedAt,
      location_updated_at: d.locationUpdatedAt,
      current_task: d.current_task,
      currentTask: d.current_task
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/nearest?binId=XX - Admin views available drivers sorted by distance to bin (admin role only)
router.get('/nearest', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const binId = req.query.binId || req.query.bin_id;
    if (!binId) {
      return res.status(400).json({ error: 'binId query parameter is required.' });
    }

    const bin = db.prepare('SELECT id, bin_code, location_name, latitude, longitude, current_fill_percent, status FROM bins WHERE id = ?').get(binId);
    if (!bin) {
      return res.status(404).json({ error: 'Bin not found.' });
    }

    const drivers = db.prepare(`
      SELECT 
        d.id,
        u.name,
        u.phone,
        d.availability,
        v.plate_number AS vehicle_plate,
        d.currentLatitude,
        d.currentLongitude,
        d.locationUpdatedAt
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.availability = 'available'
      ORDER BY d.id ASC
    `).all();

    const driversWithDistance = drivers.map(d => {
      let distanceKm = null;
      if (d.currentLatitude !== null && d.currentLongitude !== null && bin.latitude !== null && bin.longitude !== null) {
        distanceKm = haversineDistanceKm(bin.latitude, bin.longitude, d.currentLatitude, d.currentLongitude);
        distanceKm = Math.round(distanceKm * 100) / 100;
      }
      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        availability: d.availability,
        vehicle_plate: d.vehicle_plate,
        vehiclePlate: d.vehicle_plate,
        currentLatitude: d.currentLatitude,
        currentLongitude: d.currentLongitude,
        current_latitude: d.currentLatitude,
        current_longitude: d.currentLongitude,
        locationUpdatedAt: d.locationUpdatedAt,
        distanceKm: distanceKm !== null ? distanceKm : 9999
      };
    });

    driversWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    const result = driversWithDistance.map((d, index) => ({
      ...d,
      isNearest: index === 0
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers/me/location - Driver updates their current GPS coordinates (driver or admin role)
router.post('/me/location', authenticateToken, requireRole('driver', 'admin'), (req, res) => {
  try {
    const lat = req.body.latitude !== undefined ? Number(req.body.latitude) : (req.body.currentLatitude !== undefined ? Number(req.body.currentLatitude) : null);
    const lng = req.body.longitude !== undefined ? Number(req.body.longitude) : (req.body.currentLongitude !== undefined ? Number(req.body.currentLongitude) : null);

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    let driver = db.prepare(`
      SELECT d.id, d.user_id, u.name, d.availability, v.plate_number AS vehicle_plate
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.user_id = ?
    `).get(req.user.id);

    if (!driver && req.user.role === 'admin') {
      driver = db.prepare(`
        SELECT d.id, d.user_id, u.name, d.availability, v.plate_number AS vehicle_plate
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
        ORDER BY d.id ASC LIMIT 1
      `).get();
    }

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE drivers
      SET currentLatitude = ?,
          currentLongitude = ?,
          locationUpdatedAt = ?
      WHERE id = ?
    `).run(lat, lng, now, driver.id);

    const updatedDriver = {
      id: driver.id,
      name: driver.name,
      availability: driver.availability,
      vehicle_plate: driver.vehicle_plate,
      vehiclePlate: driver.vehicle_plate,
      currentLatitude: lat,
      currentLongitude: lng,
      current_latitude: lat,
      current_longitude: lng,
      locationUpdatedAt: now,
      location_updated_at: now
    };

    // Emit Socket.IO event "driver:location" whenever a driver's position changes
    const io = getIo(req);
    if (io) {
      io.emit('driver:location', updatedDriver);
    }

    saveDriverToMongo(updatedDriver);

    res.json({
      message: 'Driver location updated successfully.',
      driver: updatedDriver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:id - Get single driver
router.get('/:id', (req, res) => {
  try {
    const driver = db.prepare(driverSelectQuery + ' WHERE d.id = ?').get(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers - Admin creates a new driver account with generated credentials
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      license_number,
      assigned_vehicle_id,
      availability,
      startingLatitude,
      startingLongitude
    } = req.body;

    if (!name || !email || !license_number) {
      return res.status(400).json({ error: 'Name, email/username, and license number are required.' });
    }

    // Check duplicate email in users
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existingEmail) {
      return res.status(400).json({ error: 'An account with this email/username already exists in the system.' });
    }

    // Check duplicate license number in drivers
    const existingLicense = db.prepare('SELECT id FROM drivers WHERE license_number = ?').get(license_number.trim());
    if (existingLicense) {
      return res.status(400).json({ error: 'A driver with this license number already exists.' });
    }

    const rawPassword = password && password.trim() ? password.trim() : 'Driver@' + Math.floor(1000 + Math.random() * 9000);
    const passwordHash = bcrypt.hashSync(rawPassword, 10);

    // Initial starting GPS near Bengaluru municipal center
    const lat = startingLatitude ? Number(startingLatitude) : 12.9716 + (Math.random() * 0.04 - 0.02);
    const lng = startingLongitude ? Number(startingLongitude) : 77.5946 + (Math.random() * 0.04 - 0.02);

    const transaction = db.transaction(() => {
      const userStmt = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, phone)
        VALUES (?, ?, ?, 'driver', ?)
      `);
      const userRes = userStmt.run(name.trim(), email.trim().toLowerCase(), passwordHash, phone ? phone.trim() : null);

      const driverStmt = db.prepare(`
        INSERT INTO drivers (
          user_id,
          license_number,
          assigned_vehicle_id,
          availability,
          currentLatitude,
          currentLongitude,
          locationUpdatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const driverRes = driverStmt.run(
        userRes.lastInsertRowid,
        license_number.trim(),
        assigned_vehicle_id ? Number(assigned_vehicle_id) : null,
        availability || 'available',
        lat,
        lng
      );

      return driverRes.lastInsertRowid;
    });

    const newDriverId = transaction();
    const created = db.prepare(driverSelectQuery + ' WHERE d.id = ?').get(newDriverId);

    const io = getIo(req);
    if (io) {
      io.emit('driver:created', created);
      io.emit('driver:updated', created);
    }

    saveDriverToMongo(created);

    // Auto-approve this driver's email
    try {
      db.prepare(`
        INSERT OR IGNORE INTO approved_driver_emails (email, name, approved_by, is_active)
        VALUES (?, ?, ?, 1)
      `).run(email.trim().toLowerCase(), name.trim(), req.user.id);
    } catch (approveErr) {
      console.warn('Auto-approve driver email warning:', approveErr.message);
    }

    res.status(201).json({
      message: `Driver account created successfully for ${created.name}`,
      driver: created,
      credentials: {
        email: email.trim().toLowerCase(),
        password: rawPassword
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers/:id/reset-password - Admin generates/resets a driver's password
router.post('/:id/reset-password', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const driverId = req.params.id;
    const existing = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    if (!existing) return res.status(404).json({ error: 'Driver not found' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.user_id);
    if (!user) return res.status(404).json({ error: 'Driver user record not found' });

    const candidatePassword = req.body.password || req.body.newPassword;
    const newPassword = candidatePassword && candidatePassword.trim() ? candidatePassword.trim() : 'Driver@' + Math.floor(1000 + Math.random() * 9000);
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

    res.json({
      message: `Password reset successfully for driver ${user.name}`,
      driverId: Number(driverId),
      email: user.email,
      newPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id - Update driver & linked user profile (Admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const driverId = req.params.id;
    const existing = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    if (!existing) return res.status(404).json({ error: 'Driver not found' });

    const { name, email, phone, password, license_number, assigned_vehicle_id, availability } = req.body;

    const transaction = db.transaction(() => {
      if (name !== undefined || email !== undefined || phone !== undefined || password) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.user_id);
        const newHash = password && password.trim() ? bcrypt.hashSync(password.trim(), 10) : user.password_hash;

        db.prepare(`
          UPDATE users
          SET name = ?, email = ?, phone = ?, password_hash = ?
          WHERE id = ?
        `).run(
          name !== undefined ? name.trim() : user.name,
          email !== undefined ? email.trim().toLowerCase() : user.email,
          phone !== undefined ? phone.trim() : user.phone,
          newHash,
          existing.user_id
        );
      }

      db.prepare(`
        UPDATE drivers
        SET license_number = ?,
            assigned_vehicle_id = ?,
            availability = ?
        WHERE id = ?
      `).run(
        license_number !== undefined ? license_number.trim() : existing.license_number,
        assigned_vehicle_id !== undefined ? (assigned_vehicle_id ? Number(assigned_vehicle_id) : null) : existing.assigned_vehicle_id,
        availability !== undefined ? availability : existing.availability,
        driverId
      );
    });

    transaction();
    const updated = db.prepare(driverSelectQuery + ' WHERE d.id = ?').get(driverId);

    const io = getIo(req);
    if (io) {
      io.emit('driver:updated', updated);
    }

    saveDriverToMongo(updated);

    res.json({
      message: 'Driver updated successfully',
      driver: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers/:id/assign-vehicle - Admin assigns or changes vehicle for a driver
router.post('/:id/assign-vehicle', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const driverId = req.params.id;
    const { vehicle_id } = req.body; // number, or null/empty to unassign

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    let vehicleIdToAssign = null;
    if (vehicle_id !== null && vehicle_id !== undefined && vehicle_id !== '') {
      const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
      if (!vehicle) return res.status(404).json({ error: 'Selected vehicle not found' });
      vehicleIdToAssign = Number(vehicle_id);

      // If this vehicle was assigned to another driver, unassign that driver first
      const otherDriver = db.prepare(`
        SELECT d.id, u.name 
        FROM drivers d 
        JOIN users u ON d.user_id = u.id 
        WHERE d.assigned_vehicle_id = ? AND d.id != ?
      `).get(vehicleIdToAssign, driverId);

      if (otherDriver) {
        db.prepare('UPDATE drivers SET assigned_vehicle_id = NULL WHERE id = ?').run(otherDriver.id);
        const otherUpdated = db.prepare(driverSelectQuery + ' WHERE d.id = ?').get(otherDriver.id);
        const io = getIo(req);
        if (io && otherUpdated) {
          io.emit('driver:updated', otherUpdated);
        }
      }
    }

    db.prepare('UPDATE drivers SET assigned_vehicle_id = ? WHERE id = ?').run(vehicleIdToAssign, driverId);

    const updated = db.prepare(driverSelectQuery + ' WHERE d.id = ?').get(driverId);

    const io = getIo(req);
    if (io) {
      io.emit('driver:updated', updated);
      if (vehicleIdToAssign) {
        const updatedVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleIdToAssign);
        io.emit('vehicle:updated', updatedVehicle);
      }
    }

    saveDriverToMongo(updated);

    res.json({
      message: vehicleIdToAssign
        ? `Driver ${updated.name} assigned to vehicle ${updated.vehicle_plate || 'selected'}`
        : `Driver ${updated.name} unassigned from vehicle`,
      driver: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drivers/:id - Delete driver (Admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const driverId = req.params.id;
    const existing = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    if (!existing) return res.status(404).json({ error: 'Driver not found' });

    db.prepare('DELETE FROM users WHERE id = ?').run(existing.user_id);

    const io = getIo(req);
    if (io) {
      io.emit('driver:updated', { id: Number(driverId), deleted: true });
    }

    res.json({ message: 'Driver and associated user account deleted successfully', id: Number(driverId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Approved Driver Emails Management (Admin Only)
// ════════════════════════════════════════════════════════════════════════

// GET /api/drivers/approved-emails - List all approved driver emails
router.get('/approved-emails', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const approvedEmails = db.prepare(`
      SELECT ade.*, u.name AS approved_by_name
      FROM approved_driver_emails ade
      LEFT JOIN users u ON ade.approved_by = u.id
      ORDER BY ade.approved_at DESC
    `).all();
    res.json(approvedEmails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers/approved-emails - Add a new approved driver email
router.post('/approved-emails', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if already exists
    const existing = db.prepare('SELECT * FROM approved_driver_emails WHERE email = ?').get(normalizedEmail);
    if (existing) {
      if (!existing.is_active) {
        // Re-activate
        db.prepare('UPDATE approved_driver_emails SET is_active = 1, name = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(name ? name.trim() : existing.name, req.user.id, existing.id);
        const updated = db.prepare('SELECT * FROM approved_driver_emails WHERE id = ?').get(existing.id);
        return res.json({ message: 'Driver email re-activated.', approvedEmail: updated });
      }
      return res.status(400).json({ error: 'This email is already approved.' });
    }

    const info = db.prepare(`
      INSERT INTO approved_driver_emails (email, name, approved_by, is_active)
      VALUES (?, ?, ?, 1)
    `).run(normalizedEmail, name ? name.trim() : null, req.user.id);

    const created = db.prepare('SELECT * FROM approved_driver_emails WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ message: 'Driver email approved successfully.', approvedEmail: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/approved-emails/:id - Toggle active status
router.put('/approved-emails/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM approved_driver_emails WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Approved email record not found.' });
    }

    const newStatus = existing.is_active ? 0 : 1;
    db.prepare('UPDATE approved_driver_emails SET is_active = ? WHERE id = ?').run(newStatus, id);

    const updated = db.prepare('SELECT * FROM approved_driver_emails WHERE id = ?').get(id);
    res.json({
      message: newStatus ? 'Driver email activated.' : 'Driver email deactivated.',
      approvedEmail: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drivers/approved-emails/:id - Remove approved driver email
router.delete('/approved-emails/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM approved_driver_emails WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Approved email record not found.' });
    }

    db.prepare('DELETE FROM approved_driver_emails WHERE id = ?').run(id);
    res.json({ message: 'Driver email approval removed.', id: Number(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

