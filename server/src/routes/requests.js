import express from 'express';
import db from '../db/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { saveRequestToMongo, saveDriverToMongo, saveComplaintToMongo } from '../services/mongoSync.js';
import { haversineDistanceKm } from '../utils/distance.js';

const router = express.Router();

const getIo = (req) => req.app.get('io');

const requestSelectQuery = `
  SELECT 
    cr.id,
    cr.bin_id,
    b.bin_code,
    b.location_name,
    b.latitude,
    b.longitude,
    b.current_fill_percent,
    b.capacity_liters,
    b.status AS bin_status,
    cr.priority,
    cr.status,
    cr.source,
    cr.assigned_driver_id,
    cr.assigned_at,
    cr.complaint_id,
    cr.created_at,
    cr.completed_at,
    u.name AS driver_name,
    u.phone AS driver_phone,
    v.plate_number AS driver_vehicle_plate,
    c.photo_url AS complaint_photo,
    c.description AS complaint_description
  FROM collection_requests cr
  JOIN bins b ON cr.bin_id = b.id
  LEFT JOIN drivers d ON cr.assigned_driver_id = d.id
  LEFT JOIN users u ON d.user_id = u.id
  LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
  LEFT JOIN complaints c ON cr.complaint_id = c.id
`;

// Helper to sort by priority rank then time
const priorityOrderMap = { urgent: 1, high: 2, normal: 3 };

// GET /api/requests - List collection requests
// Sorted by priority (urgent > high > normal) then oldest first
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = requestSelectQuery + ' WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND cr.status = ?';
      params.push(status);
    }

    const requests = db.prepare(sql).all(...params);

    // Sort by priority rank (urgent > high > normal), then oldest first (created_at ASC)
    requests.sort((a, b) => {
      const pA = priorityOrderMap[a.priority] || 4;
      const pB = priorityOrderMap[b.priority] || 4;
      if (pA !== pB) return pA - pB;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id - Get single request
router.get('/:id', (req, res) => {
  try {
    const request = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Collection request not found' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to execute driver assignment logic
function assignDriverToRequest(requestId, driverId, req) {
  const request = db.prepare(`
    SELECT cr.*, b.bin_code, b.location_name, b.current_fill_percent
    FROM collection_requests cr
    JOIN bins b ON cr.bin_id = b.id
    WHERE cr.id = ?
  `).get(requestId);

  if (!request) {
    throw new Error('Collection request not found');
  }

  const driver = db.prepare(`
    SELECT d.*, u.name, u.phone, u.id AS user_id, v.plate_number AS vehicle_plate
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
    WHERE d.id = ?
  `).get(driverId);

  if (!driver) {
    throw new Error('Driver not found');
  }

  const transaction = db.transaction(() => {
    // 0. If previously assigned to a different driver, free the old driver
    if (request.assigned_driver_id && request.assigned_driver_id !== driverId) {
      const oldDriverId = request.assigned_driver_id;
      const otherTasks = db.prepare(`
        SELECT id FROM collection_requests
        WHERE assigned_driver_id = ? AND status IN ('assigned', 'in_progress') AND id != ?
      `).all(oldDriverId, requestId);

      if (otherTasks.length === 0) {
        db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(oldDriverId);
        const oldDrv = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(oldDriverId);
        if (oldDrv && oldDrv.assigned_vehicle_id) {
          db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(oldDrv.assigned_vehicle_id);
        }
      }
    }

    // 1. Update request status to 'assigned' and record assigned_driver_id and assigned_at
    db.prepare(`
      UPDATE collection_requests
      SET assigned_driver_id = ?,
          assigned_at = CURRENT_TIMESTAMP,
          status = 'assigned'
      WHERE id = ?
    `).run(driverId, requestId);

    // 2. Mark driver availability as 'busy'
    db.prepare("UPDATE drivers SET availability = 'busy' WHERE id = ?").run(driverId);

    // 3. Mark driver's vehicle as 'on_route'
    if (driver.assigned_vehicle_id) {
      db.prepare("UPDATE vehicles SET status = 'on_route' WHERE id = ?").run(driver.assigned_vehicle_id);
    }

    // 4. Create in-app notification for assigned driver:
    // "New collection task: Bin [bin_code], [location_name], [fill]% full"
    const notificationMsg = `New collection task: Bin ${request.bin_code}, ${request.location_name}, ${request.current_fill_percent}% full`;
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'New Collection Task', ?, 'urgent')
    `).run(driver.user_id, notificationMsg);

    // 5. If linked to complaint (or complaint on this bin), advance complaint to 'assigned' and notify citizen
    let complaintId = request.complaint_id;
    if (!complaintId) {
      const activeComp = db.prepare("SELECT id FROM complaints WHERE bin_id = ? AND status IN ('open', 'in_progress') ORDER BY id DESC LIMIT 1").get(request.bin_id);
      if (activeComp) complaintId = activeComp.id;
    }

    if (complaintId) {
      const note = `Driver ${driver.name} assigned for collection.`;
      db.prepare(`
        UPDATE complaints
        SET status = 'assigned',
            assigned_driver_id = ?,
            resolution_note = ?
        WHERE id = ?
      `).run(driverId, note, complaintId);

      const comp = db.prepare('SELECT citizen_id FROM complaints WHERE id = ?').get(complaintId);
      if (comp) {
        const notifMsg = `Driver ${driver.name} has been assigned to collect your reported bin ${request.bin_code || ''}.`;
        db.prepare(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES (?, 'Driver Assigned', ?, 'info')
        `).run(comp.citizen_id, notifMsg);
      }
    }
  });

  transaction();

  const updatedRequest = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(requestId);
  const updatedDriver = db.prepare(`
    SELECT 
      d.id, u.name, u.phone, d.availability,
      v.plate_number AS vehicle_plate,
      d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
    WHERE d.id = ?
  `).get(driverId);

  const formattedDriver = {
    ...updatedDriver,
    vehiclePlate: updatedDriver.vehicle_plate,
    current_latitude: updatedDriver.currentLatitude,
    current_longitude: updatedDriver.currentLongitude,
    location_updated_at: updatedDriver.locationUpdatedAt
  };

  let updatedComplaint = null;
  const targetComplaintId = request.complaint_id || db.prepare("SELECT id FROM complaints WHERE bin_id = ? AND status = 'assigned' ORDER BY id DESC LIMIT 1").get(request.bin_id)?.id;
  if (targetComplaintId) {
    updatedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(targetComplaintId);
  }

  const io = getIo(req);
  if (io) {
    io.emit('request:updated', updatedRequest);
    io.emit('driver:location', formattedDriver);
    io.emit('driver:updated', formattedDriver);
    io.emit('notification:new');
    if (updatedComplaint) {
      io.emit('complaint:updated', updatedComplaint);
    }
    io.emit('requests:updated');
  }

  saveRequestToMongo(updatedRequest);
  saveDriverToMongo(formattedDriver);
  if (updatedComplaint) saveComplaintToMongo(updatedComplaint);

  return { updatedRequest, formattedDriver, updatedComplaint };
}

// POST /api/requests/:id/assign - Assign driver to existing collection request (admin only)
router.post('/:id/assign', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const requestId = req.params.id;
    const { driver_id } = req.body;

    if (!driver_id) {
      return res.status(400).json({ error: 'driver_id is required' });
    }

    const result = assignDriverToRequest(requestId, driver_id, req);

    res.json({
      message: 'Driver successfully assigned',
      request: result.updatedRequest,
      driver: result.formattedDriver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/unassign - Admin unassigns driver from collection request
router.post('/:id/unassign', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const requestId = req.params.id;
    const request = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Collection request not found' });

    const previousDriverId = request.assigned_driver_id;

    const transaction = db.transaction(() => {
      // 1. Reset collection request to pending, clear assigned driver
      db.prepare(`
        UPDATE collection_requests
        SET assigned_driver_id = NULL,
            assigned_at = NULL,
            status = 'pending'
        WHERE id = ?
      `).run(requestId);

      // 2. If there was an assigned driver, check if they have any other active tasks
      if (previousDriverId) {
        const otherTasks = db.prepare(`
          SELECT id FROM collection_requests
          WHERE assigned_driver_id = ? AND status IN ('assigned', 'in_progress') AND id != ?
        `).all(previousDriverId, requestId);

        if (otherTasks.length === 0) {
          db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(previousDriverId);
          const drv = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(previousDriverId);
          if (drv && drv.assigned_vehicle_id) {
            db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(drv.assigned_vehicle_id);
          }
        }
      }

      // 3. If linked to a complaint, reset complaint status back to 'open'
      if (request.complaint_id) {
        db.prepare(`
          UPDATE complaints
          SET status = 'open',
              assigned_driver_id = NULL,
              resolution_note = 'Driver unassigned by municipal admin; pending reassignment.'
          WHERE id = ?
        `).run(request.complaint_id);
      }
    });

    transaction();

    const updatedRequest = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(requestId);

    let updatedDriver = null;
    if (previousDriverId) {
      updatedDriver = db.prepare(`
        SELECT 
          d.id, u.name, u.phone, d.availability,
          v.plate_number AS vehicle_plate,
          d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
        WHERE d.id = ?
      `).get(previousDriverId);
    }

    let updatedComplaint = null;
    if (request.complaint_id) {
      updatedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(request.complaint_id);
    }

    const io = getIo(req);
    if (io) {
      io.emit('request:updated', updatedRequest);
      io.emit('requests:updated');
      if (updatedDriver) {
        io.emit('driver:updated', updatedDriver);
        io.emit('driver:location', updatedDriver);
      }
      if (updatedComplaint) {
        io.emit('complaint:updated', updatedComplaint);
      }
      io.emit('notification:new');
    }

    saveRequestToMongo(updatedRequest);
    if (updatedDriver) saveDriverToMongo(updatedDriver);
    if (updatedComplaint) saveComplaintToMongo(updatedComplaint);

    res.json({
      message: `Driver unassigned from collection request #${requestId}. Request is now pending.`,
      request: updatedRequest,
      driver: updatedDriver,
      complaint: updatedComplaint
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/assign-bin - Direct assign driver to a bin (creating or finding pending request)
router.post('/assign-bin', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { bin_id, driver_id, priority, source, complaint_id } = req.body;

    if (!bin_id || !driver_id) {
      return res.status(400).json({ error: 'bin_id and driver_id are required' });
    }

    // Check if there is already an existing pending request for this bin
    let request = db.prepare(`
      SELECT * FROM collection_requests
      WHERE bin_id = ? AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `).get(bin_id);

    let requestId = request ? request.id : null;

    if (!requestId) {
      const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(bin_id);
      if (!bin) return res.status(404).json({ error: 'Target bin not found' });

      let reqPriority = priority;
      if (!reqPriority) {
        const fill = bin.current_fill_percent;
        if (fill > 95) reqPriority = 'urgent';
        else if (fill >= 90) reqPriority = 'high';
        else reqPriority = 'normal';
      }

      const insertStmt = db.prepare(`
        INSERT INTO collection_requests (bin_id, priority, status, source, complaint_id)
        VALUES (?, ?, 'pending', ?, ?)
      `);
      const info = insertStmt.run(bin_id, reqPriority, source || 'manual', complaint_id || null);
      requestId = info.lastInsertRowid;
    }

    const result = assignDriverToRequest(requestId, driver_id, req);

    res.json({
      message: 'Driver successfully assigned to bin',
      request: result.updatedRequest,
      driver: result.formattedDriver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/assign-nearest - Automatically find and assign nearest available driver to a bin/request
router.post('/assign-nearest', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { bin_id, request_id, complaint_id, priority, source } = req.body;

    let targetBinId = bin_id;
    let targetRequestId = request_id;

    if (!targetBinId && targetRequestId) {
      const existingReq = db.prepare('SELECT bin_id FROM collection_requests WHERE id = ?').get(targetRequestId);
      if (existingReq) targetBinId = existingReq.bin_id;
    }

    if (!targetBinId) {
      return res.status(400).json({ error: 'bin_id or request_id is required' });
    }

    const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(targetBinId);
    if (!bin) {
      return res.status(404).json({ error: 'Bin not found' });
    }

    // Query all available drivers
    const availableDrivers = db.prepare(`
      SELECT 
        d.id,
        u.name,
        u.phone,
        d.availability,
        v.plate_number AS vehicle_plate,
        d.currentLatitude,
        d.currentLongitude
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.availability = 'available'
    `).all();

    if (availableDrivers.length === 0) {
      return res.status(400).json({ error: 'No drivers are currently available. All drivers are busy or off duty.' });
    }

    // Calculate distance to each available driver and pick the nearest
    let nearestDriver = null;
    let minDistance = Infinity;

    availableDrivers.forEach((d) => {
      let dist = Infinity;
      if (d.currentLatitude !== null && d.currentLongitude !== null && bin.latitude !== null && bin.longitude !== null) {
        dist = haversineDistanceKm(bin.latitude, bin.longitude, d.currentLatitude, d.currentLongitude);
      }
      if (dist < minDistance) {
        minDistance = dist;
        nearestDriver = {
          ...d,
          distanceKm: Math.round(dist * 10) / 10
        };
      }
    });

    if (!nearestDriver) {
      nearestDriver = { ...availableDrivers[0], distanceKm: null };
    }

    // Find or create pending collection request
    if (!targetRequestId) {
      let request = db.prepare(`
        SELECT * FROM collection_requests
        WHERE bin_id = ? AND status = 'pending'
        ORDER BY id DESC LIMIT 1
      `).get(targetBinId);

      if (request) {
        targetRequestId = request.id;
        if (complaint_id && !request.complaint_id) {
          db.prepare('UPDATE collection_requests SET complaint_id = ? WHERE id = ?').run(complaint_id, targetRequestId);
        }
      } else {
        let reqPriority = priority;
        if (!reqPriority) {
          reqPriority = bin.current_fill_percent >= 80 ? 'urgent' : 'high';
        }
        const insertStmt = db.prepare(`
          INSERT INTO collection_requests (bin_id, priority, status, source, complaint_id)
          VALUES (?, ?, 'pending', ?, ?)
        `);
        const info = insertStmt.run(targetBinId, reqPriority, source || (complaint_id ? 'complaint' : 'auto_nearest'), complaint_id || null);
        targetRequestId = info.lastInsertRowid;
      }
    }

    const result = assignDriverToRequest(targetRequestId, nearestDriver.id, req);

    res.json({
      message: `Nearest driver ${nearestDriver.name} (${nearestDriver.distanceKm !== null ? nearestDriver.distanceKm + ' km away' : 'closest'}) assigned to Bin ${bin.bin_code}`,
      driver: nearestDriver,
      request: result.updatedRequest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests - Create manual or automated collection request
router.post('/', (req, res) => {
  try {
    const { bin_id, priority, status, source, complaint_id } = req.body;

    if (!bin_id) {
      return res.status(400).json({ error: 'bin_id is required' });
    }

    const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(bin_id);
    if (!bin) {
      return res.status(404).json({ error: 'Target bin not found' });
    }

    // Determine priority if not explicitly specified
    let reqPriority = priority;
    if (!reqPriority) {
      const fill = bin.current_fill_percent;
      if (fill > 95) reqPriority = 'urgent';
      else if (fill >= 90) reqPriority = 'high';
      else reqPriority = 'normal';
    }

    const stmt = db.prepare(`
      INSERT INTO collection_requests (bin_id, priority, status, source, complaint_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      bin_id,
      reqPriority,
      status || 'pending',
      source || 'manual',
      complaint_id || null
    );
    const newRequest = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(info.lastInsertRowid);

    const io = getIo(req);
    if (io) {
      io.emit('request:created', newRequest);
      io.emit('requests:updated');
    }

    saveRequestToMongo(newRequest);

    res.status(201).json(newRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/requests/:id - Update request status
router.put('/:id', (req, res) => {
  try {
    const requestId = req.params.id;
    const existing = db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId);
    if (!existing) return res.status(404).json({ error: 'Collection request not found' });

    const { status, priority, assigned_driver_id } = req.body;

    let completedAt = existing.completed_at;
    if (status === 'completed' && existing.status !== 'completed') {
      completedAt = new Date().toISOString();

      // Reset bin fill level to 5% and update last_emptied_at
      db.prepare(`
        UPDATE bins
        SET current_fill_percent = 5,
            last_emptied_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existing.bin_id);

      // If there was an assigned driver, free the driver and vehicle
      const driverId = assigned_driver_id !== undefined ? assigned_driver_id : existing.assigned_driver_id;
      if (driverId) {
        db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(driverId);
        const drv = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(driverId);
        if (drv && drv.assigned_vehicle_id) {
          db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(drv.assigned_vehicle_id);
        }
      }

      const updatedBin = db.prepare('SELECT * FROM bins WHERE id = ?').get(existing.bin_id);
      const io = getIo(req);
      if (io) io.emit('bin:updated', updatedBin);
    }

    db.prepare(`
      UPDATE collection_requests
      SET status = ?,
          priority = ?,
          assigned_driver_id = ?,
          completed_at = ?
      WHERE id = ?
    `).run(
      status !== undefined ? status : existing.status,
      priority !== undefined ? priority : existing.priority,
      assigned_driver_id !== undefined ? assigned_driver_id : existing.assigned_driver_id,
      completedAt,
      requestId
    );

    const updatedRequest = db.prepare(requestSelectQuery + ' WHERE cr.id = ?').get(requestId);
    const io = getIo(req);
    if (io) {
      io.emit('request:updated', updatedRequest);
      io.emit('requests:updated');
    }

    saveRequestToMongo(updatedRequest);

    res.json(updatedRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/requests/:id - Cancel/Delete request
router.delete('/:id', (req, res) => {
  try {
    const requestId = req.params.id;
    const existing = db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId);
    if (!existing) return res.status(404).json({ error: 'Collection request not found' });

    // If request had an assigned driver, free the driver
    if (existing.assigned_driver_id) {
      db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(existing.assigned_driver_id);
      const drv = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(existing.assigned_driver_id);
      if (drv && drv.assigned_vehicle_id) {
        db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(drv.assigned_vehicle_id);
      }
    }

    db.prepare('DELETE FROM collection_requests WHERE id = ?').run(requestId);

    const io = getIo(req);
    if (io) {
      io.emit('request:deleted', { id: Number(requestId) });
      io.emit('requests:updated');
    }

    res.json({ message: 'Collection request cancelled successfully', id: Number(requestId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
