import express from 'express';
import db from '../db/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const getIo = (req) => req.app.get('io');

const vehicleSelectQuery = `
  SELECT 
    v.*,
    d.id AS driver_id,
    d.availability AS driver_availability,
    u.name AS driver_name,
    u.phone AS driver_phone,
    u.email AS driver_email
  FROM vehicles v
  LEFT JOIN drivers d ON d.assigned_vehicle_id = v.id
  LEFT JOIN users u ON u.id = d.user_id
`;

// GET /api/vehicles - List all vehicles with assigned driver info
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = vehicleSelectQuery + ' WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND v.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY v.id ASC';
    const vehicles = db.prepare(sql).all(...params);
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vehicles/:id - Get single vehicle
router.get('/:id', (req, res) => {
  try {
    const vehicle = db.prepare(vehicleSelectQuery + ' WHERE v.id = ?').get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicles - Admin creates a new vehicle
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { plate_number, model, fuel_type, tank_capacity, avg_mileage_kmpl, status } = req.body;

    if (!plate_number || !model || avg_mileage_kmpl === undefined) {
      return res.status(400).json({ error: 'plate_number, model, and avg_mileage_kmpl are required' });
    }

    const cleanPlate = plate_number.trim().toUpperCase();

    // Check duplicate plate_number
    const existing = db.prepare('SELECT id FROM vehicles WHERE plate_number = ?').get(cleanPlate);
    if (existing) {
      return res.status(400).json({ error: `Vehicle with plate number ${cleanPlate} already exists.` });
    }

    const stmt = db.prepare(`
      INSERT INTO vehicles (plate_number, model, fuel_type, tank_capacity, avg_mileage_kmpl, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      cleanPlate,
      model.trim(),
      fuel_type ? fuel_type.trim() : 'Diesel',
      tank_capacity ? Number(tank_capacity) : 150.0,
      Number(avg_mileage_kmpl),
      status || 'available'
    );

    const newVehicle = db.prepare(vehicleSelectQuery + ' WHERE v.id = ?').get(info.lastInsertRowid);

    const io = getIo(req);
    if (io) {
      io.emit('vehicle:created', newVehicle);
    }

    res.status(201).json(newVehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vehicles/:id - Admin updates vehicle
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const vehicleId = req.params.id;
    const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    const { plate_number, model, fuel_type, tank_capacity, avg_mileage_kmpl, status } = req.body;

    const cleanPlate = plate_number !== undefined ? plate_number.trim().toUpperCase() : existing.plate_number;
    if (cleanPlate !== existing.plate_number) {
      const dup = db.prepare('SELECT id FROM vehicles WHERE plate_number = ? AND id != ?').get(cleanPlate, vehicleId);
      if (dup) {
        return res.status(400).json({ error: `Vehicle with plate number ${cleanPlate} already exists.` });
      }
    }

    const stmt = db.prepare(`
      UPDATE vehicles
      SET plate_number = ?,
          model = ?,
          fuel_type = ?,
          tank_capacity = ?,
          avg_mileage_kmpl = ?,
          status = ?
      WHERE id = ?
    `);

    stmt.run(
      cleanPlate,
      model !== undefined ? model.trim() : existing.model,
      fuel_type !== undefined ? fuel_type.trim() : existing.fuel_type,
      tank_capacity !== undefined ? Number(tank_capacity) : existing.tank_capacity,
      avg_mileage_kmpl !== undefined ? Number(avg_mileage_kmpl) : existing.avg_mileage_kmpl,
      status !== undefined ? status : existing.status,
      vehicleId
    );

    const updated = db.prepare(vehicleSelectQuery + ' WHERE v.id = ?').get(vehicleId);

    const io = getIo(req);
    if (io) {
      io.emit('vehicle:updated', updated);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vehicles/:id - Admin deletes vehicle, automatically unassigns any linked driver
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const vehicleId = req.params.id;
    const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    // Atomic transaction: unassign drivers, unassign routes, delete logs, delete vehicle
    const transaction = db.transaction(() => {
      // 1. Identify all drivers currently assigned to this vehicle
      const affectedDrivers = db.prepare(`
        SELECT d.id, u.name 
        FROM drivers d 
        JOIN users u ON d.user_id = u.id 
        WHERE d.assigned_vehicle_id = ?
      `).all(vehicleId);

      // 2. Unassign the drivers
      db.prepare('UPDATE drivers SET assigned_vehicle_id = NULL WHERE assigned_vehicle_id = ?').run(vehicleId);

      // 3. Unassign routes linked to this vehicle
      db.prepare('UPDATE routes SET vehicle_id = NULL WHERE vehicle_id = ?').run(vehicleId);

      // 4. Delete fuel logs for this vehicle
      db.prepare('DELETE FROM fuel_logs WHERE vehicle_id = ?').run(vehicleId);

      // 5. Delete the vehicle record
      db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicleId);

      return affectedDrivers;
    });

    const affectedDrivers = transaction();

    // Emit Socket.IO events for live UI updates
    const io = getIo(req);
    if (io) {
      io.emit('vehicle:deleted', { id: Number(vehicleId), plate_number: existing.plate_number });
      affectedDrivers.forEach((d) => {
        const updatedDriver = db.prepare(`
          SELECT 
            d.id,
            d.user_id,
            u.name,
            u.email,
            u.phone,
            d.license_number,
            d.assigned_vehicle_id,
            NULL AS vehicle_plate,
            NULL AS vehicle_model,
            d.availability,
            d.currentLatitude,
            d.currentLongitude,
            d.locationUpdatedAt
          FROM drivers d
          JOIN users u ON d.user_id = u.id
          WHERE d.id = ?
        `).get(d.id);
        if (updatedDriver) {
          io.emit('driver:updated', updatedDriver);
        }
      });
    }

    res.json({
      message: `Vehicle ${existing.plate_number} deleted successfully.`,
      id: Number(vehicleId),
      unassignedDrivers: affectedDrivers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
