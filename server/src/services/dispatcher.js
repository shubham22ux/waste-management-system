import db from '../db/index.js';
import { haversineDistanceKm } from '../utils/distance.js';
import { saveRequestToMongo, saveDriverToMongo, saveComplaintToMongo } from './mongoSync.js';

const requestDetailQuery = `
  SELECT 
    cr.id, cr.bin_id, b.bin_code, b.location_name, b.latitude, b.longitude,
    b.current_fill_percent, b.capacity_liters, cr.priority, cr.status,
    cr.source, cr.assigned_driver_id, cr.assigned_at, cr.complaint_id, cr.created_at,
    u.name AS driver_name, u.phone AS driver_phone,
    v.plate_number AS driver_vehicle_plate
  FROM collection_requests cr
  JOIN bins b ON cr.bin_id = b.id
  LEFT JOIN drivers d ON cr.assigned_driver_id = d.id
  LEFT JOIN users u ON d.user_id = u.id
  LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
`;

/**
 * Automatically assigns the nearest active/available driver when a bin is full (>= 80%).
 * If no driver is available, creates/maintains a pending request for admin action.
 * 
 * @param {Object} bin The bin object (must include id, bin_code, location_name, latitude, longitude, current_fill_percent)
 * @param {Object} io Socket.IO instance
 * @returns {Object|null} Result of dispatch
 */
export function autoAssignFullBin(bin, io) {
  if (!bin || bin.current_fill_percent < 80) return null;

  try {
    // 1. Check if there is already an active assigned or in-progress request for this bin
    const activeAssigned = db.prepare(`
      SELECT id, assigned_driver_id, status 
      FROM collection_requests
      WHERE bin_id = ? AND status IN ('assigned', 'in_progress')
      ORDER BY id DESC LIMIT 1
    `).get(bin.id);

    if (activeAssigned) {
      // Bin already has an assigned driver actively working on it
      return null;
    }

    // 2. Check if an unassigned pending request already exists for this bin
    const pendingRequest = db.prepare(`
      SELECT id FROM collection_requests
      WHERE bin_id = ? AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `).get(bin.id);

    // 3. Query all active drivers who are currently available
    const availableDrivers = db.prepare(`
      SELECT 
        d.id, u.name, u.phone, u.id AS user_id,
        d.availability, d.assigned_vehicle_id,
        v.plate_number AS vehicle_plate,
        d.currentLatitude, d.currentLongitude
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.availability = 'available'
    `).all();

    // Determine priority
    let priority = 'normal';
    if (bin.current_fill_percent > 95) priority = 'urgent';
    else if (bin.current_fill_percent >= 90) priority = 'high';

    if (availableDrivers.length > 0) {
      // 4. Calculate distance to each available driver and find the nearest
      let nearestDriver = null;
      let minDistance = Infinity;

      for (const d of availableDrivers) {
        let dist = Infinity;
        if (
          d.currentLatitude !== null &&
          d.currentLongitude !== null &&
          bin.latitude !== null &&
          bin.longitude !== null
        ) {
          dist = haversineDistanceKm(
            Number(bin.latitude),
            Number(bin.longitude),
            Number(d.currentLatitude),
            Number(d.currentLongitude)
          );
        }

        if (dist < minDistance) {
          minDistance = dist;
          nearestDriver = {
            ...d,
            distanceKm: Math.round(dist * 10) / 10
          };
        }
      }

      if (!nearestDriver) {
        nearestDriver = { ...availableDrivers[0], distanceKm: null };
      }

      let requestId = pendingRequest ? pendingRequest.id : null;

      // 5. Execute atomic assignment
      const transaction = db.transaction(() => {
        if (requestId) {
          db.prepare(`
            UPDATE collection_requests
            SET assigned_driver_id = ?,
                assigned_at = CURRENT_TIMESTAMP,
                status = 'assigned',
                priority = ?
            WHERE id = ?
          `).run(nearestDriver.id, priority, requestId);
        } else {
          const insertStmt = db.prepare(`
            INSERT INTO collection_requests (bin_id, priority, status, source, assigned_driver_id, assigned_at)
            VALUES (?, ?, 'assigned', 'sensor', ?, CURRENT_TIMESTAMP)
          `);
          const info = insertStmt.run(bin.id, priority, nearestDriver.id);
          requestId = info.lastInsertRowid;
        }

        // Set driver to busy
        db.prepare("UPDATE drivers SET availability = 'busy' WHERE id = ?").run(nearestDriver.id);

        // Set driver's vehicle to on_route
        if (nearestDriver.assigned_vehicle_id) {
          db.prepare("UPDATE vehicles SET status = 'on_route' WHERE id = ?").run(nearestDriver.assigned_vehicle_id);
        }

        // Send notification to the driver
        const driverMsg = `Automated Collection Task: Bin ${bin.bin_code} at ${bin.location_name} is full (${bin.current_fill_percent}%) — Assigned to you.`;
        db.prepare(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES (?, 'New Collection Task', ?, 'urgent')
        `).run(nearestDriver.user_id, driverMsg);

        // Send notification to all municipal admins
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        const distText = nearestDriver.distanceKm !== null ? `(${nearestDriver.distanceKm} km away)` : '';
        const adminMsg = `Bin ${bin.bin_code} reached ${bin.current_fill_percent}% — Automatically assigned to nearest active driver ${nearestDriver.name} ${distText}.`;

        for (const admin of admins) {
          db.prepare(`
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Automatic Driver Dispatch', ?, ?)
          `).run(admin.id, adminMsg, priority);
        }

        // Check if there is an open citizen complaint for this bin, and advance it
        const comp = db.prepare("SELECT id, citizen_id FROM complaints WHERE bin_id = ? AND status IN ('open', 'in_progress') ORDER BY id DESC LIMIT 1").get(bin.id);
        if (comp) {
          const note = `Nearest driver ${nearestDriver.name} automatically assigned for collection (${bin.current_fill_percent}% full).`;
          db.prepare(`
            UPDATE complaints
            SET status = 'assigned',
                assigned_driver_id = ?,
                resolution_note = ?
            WHERE id = ?
          `).run(nearestDriver.id, note, comp.id);

          const citizenMsg = `Driver ${nearestDriver.name} has been automatically assigned to collect your reported bin ${bin.bin_code}.`;
          db.prepare(`
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Driver Assigned', ?, 'info')
          `).run(comp.citizen_id, citizenMsg);
        }
      });

      transaction();

      const createdRequest = db.prepare(requestDetailQuery + ' WHERE cr.id = ?').get(requestId);
      const updatedDriver = db.prepare(`
        SELECT 
          d.id, u.name, u.phone, d.availability,
          v.plate_number AS vehicle_plate,
          d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
        WHERE d.id = ?
      `).get(nearestDriver.id);

      console.log(`[IoT Auto-Assign] Bin ${bin.bin_code} is ${bin.current_fill_percent}% full -> Assigned to nearest active driver ${nearestDriver.name} (Request #${requestId})`);

      if (io) {
        io.emit('request:created', createdRequest);
        io.emit('request:updated', createdRequest);
        io.emit('requests:updated');
        io.emit('driver:updated', updatedDriver);
        io.emit('driver:location', updatedDriver);
        io.emit('notification:new');
        io.emit('bin:alert', {
          bin,
          request: createdRequest,
          message: `Bin ${bin.bin_code} is full (${bin.current_fill_percent}%) — Automatically dispatched nearest driver ${nearestDriver.name}.`,
          timestamp: new Date().toISOString()
        });
      }

      saveRequestToMongo(createdRequest);
      saveDriverToMongo(updatedDriver);

      return { request: createdRequest, driver: nearestDriver, automated: true };
    } else {
      // No drivers available: create or retain pending request and alert admins
      let requestId = pendingRequest ? pendingRequest.id : null;

      if (!requestId) {
        const reqInfo = db.prepare(`
          INSERT INTO collection_requests (bin_id, priority, status, source, assigned_driver_id)
          VALUES (?, ?, 'pending', 'sensor', NULL)
        `).run(bin.id, priority);
        requestId = reqInfo.lastInsertRowid;

        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        const adminMsg = `Bin ${bin.bin_code} is ${bin.current_fill_percent}% full — No active drivers currently available. Created pending request for admin assignment.`;

        for (const admin of admins) {
          db.prepare(`
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Collection Request Pending', ?, ?)
          `).run(admin.id, adminMsg, priority);
        }
      }

      const pendingReq = db.prepare(requestDetailQuery + ' WHERE cr.id = ?').get(requestId);

      console.log(`[IoT Auto-Assign] Bin ${bin.bin_code} is ${bin.current_fill_percent}% full -> No active drivers available. Request #${requestId} is pending admin assignment.`);

      if (io) {
        io.emit('request:created', pendingReq);
        io.emit('requests:updated');
        io.emit('notification:new');
        io.emit('bin:alert', {
          bin,
          request: pendingReq,
          message: `Bin ${bin.bin_code} is full (${bin.current_fill_percent}%) — Pending driver assignment.`,
          timestamp: new Date().toISOString()
        });
      }

      saveRequestToMongo(pendingReq);

      return { request: pendingReq, driver: null, automated: false };
    }
  } catch (err) {
    console.error('[Dispatcher Error]', err.message);
    return null;
  }
}

export default { autoAssignFullBin };
