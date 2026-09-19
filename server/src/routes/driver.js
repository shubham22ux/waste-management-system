import express from 'express';
import db from '../db/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { DEPOT_CONFIG } from '../config/depot.js';
import { saveRouteToMongo, saveBinToMongo, saveFuelLogToMongo, saveDriverToMongo, saveRequestToMongo } from '../services/mongoSync.js';

const router = express.Router();

const getIo = (req) => req.app.get('io');

// Helper to resolve driver record from authenticated user
function getDriverFromUser(userId, role) {
  let driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(userId);

  // If admin is inspecting driver views, fallback to first driver if not linked
  if (!driver && role === 'admin') {
    driver = db.prepare('SELECT * FROM drivers ORDER BY id ASC LIMIT 1').get();
  }
  return driver;
}

// Check if driver has any other pending/assigned tasks; if none, set driver & vehicle to 'available'
function updateDriverAvailabilityIfDone(driverId) {
  const pendingRequests = db.prepare(`
    SELECT COUNT(*) AS count
    FROM collection_requests
    WHERE assigned_driver_id = ? AND status IN ('assigned', 'in_progress')
  `).get(driverId)?.count || 0;

  const pendingStops = db.prepare(`
    SELECT COUNT(*) AS count
    FROM route_stops rs
    JOIN routes r ON rs.route_id = r.id
    WHERE r.driver_id = ? AND r.status IN ('planned', 'in_progress') AND rs.status = 'pending'
  `).get(driverId)?.count || 0;

  if (pendingRequests === 0 && pendingStops === 0) {
    db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(driverId);
    const driver = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(driverId);
    if (driver && driver.assigned_vehicle_id) {
      db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(driver.assigned_vehicle_id);
    }
    return true; // freed
  }
  return false;
}

// Core reusable collection execution routine
function executeMarkCollected({ binId, requestId, stopId, driverId, req }) {
  const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
  if (!bin) throw new Error('Target bin not found.');

  const driverRow = db.prepare(`
    SELECT d.*, u.name, u.phone
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    WHERE d.id = ?
  `).get(driverId);

  const driverName = driverRow ? driverRow.name : 'Driver';
  const driverFirstName = driverName.split(' ')[0] || driverName;

  let completedComplaint = null;

  const transaction = db.transaction(() => {
    // 1. Set bin fill level to 5% and update last_emptied_at
    db.prepare(`
      UPDATE bins
      SET current_fill_percent = 5,
          last_emptied_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(binId);

    // 2. Set collection request to 'completed' with completed_at
    if (requestId) {
      db.prepare(`
        UPDATE collection_requests
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(requestId);
    } else {
      db.prepare(`
        UPDATE collection_requests
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE bin_id = ? AND status IN ('pending', 'assigned', 'in_progress')
      `).run(binId);
    }

    // 3. Mark route stop collected if applicable
    if (stopId) {
      db.prepare(`
        UPDATE route_stops
        SET status = 'collected',
            skip_reason = NULL,
            collected_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stopId);
    } else {
      db.prepare(`
        UPDATE route_stops
        SET status = 'collected',
            skip_reason = NULL,
            collected_at = CURRENT_TIMESTAMP
        WHERE bin_id = ? AND route_id IN (
          SELECT id FROM routes WHERE driver_id = ? AND status = 'in_progress'
        )
      `).run(binId, driverId);
    }

    // 4. Set driver back to 'available' and vehicle to 'available' if driver has no other pending tasks
    updateDriverAvailabilityIfDone(driverId);

    // 5. If request came from citizen complaint, advance complaint status to 'collected'
    let complaintId = null;
    if (requestId) {
      const cr = db.prepare('SELECT complaint_id FROM collection_requests WHERE id = ?').get(requestId);
      if (cr && cr.complaint_id) complaintId = cr.complaint_id;
    }
    if (!complaintId) {
      const comp = db.prepare("SELECT id FROM complaints WHERE bin_id = ? AND status IN ('open', 'assigned', 'in_progress') ORDER BY id DESC LIMIT 1").get(binId);
      if (comp) complaintId = comp.id;
    }

    if (complaintId) {
      db.prepare(`
        UPDATE complaints
        SET status = 'collected',
            resolution_note = ?
        WHERE id = ?
      `).run(`Collected by driver ${driverName}`, complaintId);
      completedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);

      // Milestone 2 Notification: Notify citizen that bin was collected
      if (completedComplaint && completedComplaint.citizen_id) {
        const citizenNotifMsg = `Driver ${driverFirstName} has collected the reported bin ${bin.bin_code}.`;
        db.prepare(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES (?, 'Bin Collected', ?, 'success')
        `).run(completedComplaint.citizen_id, citizenNotifMsg);
      }
    }

    // 6. Format notification message: "Driver Ramesh collected Bin B-014 at MG Road — 2:45 PM"
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const notificationMsg = `Driver ${driverFirstName} collected Bin ${bin.bin_code} at ${bin.location_name} — ${timeStr}`;

    // 7. Create notification for all admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
    for (const admin of admins) {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Bin Collected', ?, 'success')
      `).run(admin.id, notificationMsg);
    }

    return { notificationMsg, completedComplaint };
  });

  const { notificationMsg, completedComplaint: updatedComplaint } = transaction();

  const updatedBin = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
  const updatedReq = requestId ? db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId) : null;
  const updatedDriver = db.prepare(`
    SELECT d.id, u.name, d.availability, v.plate_number AS vehicle_plate, d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
    WHERE d.id = ?
  `).get(driverId);

  const io = getIo(req);
  if (io) {
    // Socket.IO event "collection:completed"
    io.emit('collection:completed', {
      bin: updatedBin,
      request: updatedReq,
      driver: updatedDriver,
      message: notificationMsg,
      timestamp: new Date().toISOString()
    });
    io.emit('notification:new', { message: notificationMsg });
    io.emit('bin:updated', updatedBin);
    io.emit('requests:updated');
    io.emit('driver:location', updatedDriver);
    io.emit('driver:updated', updatedDriver);
    if (updatedComplaint) {
      io.emit('complaint:updated', updatedComplaint);
    }
  }

  saveBinToMongo(updatedBin);
  if (updatedReq) saveRequestToMongo(updatedReq);
  if (updatedDriver) saveDriverToMongo(updatedDriver);

  return { updatedBin, updatedReq, updatedDriver, notificationMsg, updatedComplaint };
}

// All driver endpoints require authentication
router.use(authenticateToken);
router.use(requireRole('driver', 'admin'));

// POST /api/driver/me/location - Driver updates their current GPS coordinates
router.post('/me/location', (req, res) => {
  try {
    const lat = req.body.latitude !== undefined ? Number(req.body.latitude) : (req.body.currentLatitude !== undefined ? Number(req.body.currentLatitude) : null);
    const lng = req.body.longitude !== undefined ? Number(req.body.longitude) : (req.body.currentLongitude !== undefined ? Number(req.body.currentLongitude) : null);

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    const driver = getDriverFromUser(req.user.id, req.user.role);
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
      currentLatitude: lat,
      currentLongitude: lng,
      current_latitude: lat,
      current_longitude: lng,
      locationUpdatedAt: now,
      location_updated_at: now
    };

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

// GET /api/driver/tasks - Get all assigned collection tasks for logged-in driver
router.get('/tasks', (req, res) => {
  try {
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found.' });
    }

    const tasksQuery = `
      SELECT 
        cr.id,
        cr.bin_id,
        cr.priority,
        cr.status AS request_status,
        cr.source,
        cr.assigned_driver_id,
        cr.assigned_at,
        cr.complaint_id,
        cr.skip_reason,
        cr.created_at,
        cr.completed_at,
        b.bin_code,
        b.location_name,
        b.latitude,
        b.longitude,
        b.current_fill_percent,
        b.capacity_liters,
        b.status AS bin_status,
        b.last_emptied_at,
        c.photo_url AS complaint_photo,
        c.description AS complaint_description,
        c.type AS complaint_type
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      LEFT JOIN complaints c ON cr.complaint_id = c.id
      WHERE cr.assigned_driver_id = ? AND cr.status IN ('assigned', 'in_progress', 'pending')
      ORDER BY 
        CASE cr.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        cr.created_at ASC
    `;

    const tasks = db.prepare(tasksQuery).all(driver.id);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/driver/tasks/:id/collect - Driver marks assigned collection request collected
router.post('/tasks/:id/collect', (req, res) => {
  try {
    const requestId = req.params.id;
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

    const request = db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Collection request not found.' });

    const result = executeMarkCollected({
      binId: request.bin_id,
      requestId: request.id,
      stopId: null,
      driverId: driver.id,
      req
    });

    res.json({
      message: result.notificationMsg,
      bin: result.updatedBin,
      driver: result.updatedDriver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/driver/tasks/:id/skip - Driver skips assigned collection request with reason
router.post('/tasks/:id/skip', (req, res) => {
  try {
    const requestId = req.params.id;
    const { skip_reason } = req.body;
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

    const reason = skip_reason || 'Driver reported inaccessible / blocked';

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE collection_requests
        SET status = 'skipped',
            skip_reason = ?
        WHERE id = ?
      `).run(reason, requestId);

      updateDriverAvailabilityIfDone(driver.id);
    });

    transaction();

    const updatedReq = db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId);
    const updatedDriver = db.prepare(`
      SELECT d.id, u.name, d.availability, v.plate_number AS vehicle_plate, d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.id = ?
    `).get(driver.id);

    const io = getIo(req);
    if (io) {
      io.emit('request:updated', updatedReq);
      io.emit('requests:updated');
      io.emit('driver:updated', updatedDriver);
      io.emit('driver:location', updatedDriver);
    }

    res.json({
      message: `Task #${requestId} marked as skipped.`,
      request: updatedReq,
      driver: updatedDriver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/driver/active-route - Get active assigned route and tasks for logged-in driver
router.get('/active-route', (req, res) => {
  try {
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found.' });
    }

    // Fetch standalone assigned tasks
    const tasksQuery = `
      SELECT 
        cr.id,
        cr.bin_id,
        cr.priority,
        cr.status AS request_status,
        cr.source,
        cr.assigned_driver_id,
        cr.assigned_at,
        cr.complaint_id,
        cr.skip_reason,
        cr.created_at,
        cr.completed_at,
        b.bin_code,
        b.location_name,
        b.latitude,
        b.longitude,
        b.current_fill_percent,
        b.capacity_liters,
        b.status AS bin_status,
        b.last_emptied_at,
        c.photo_url AS complaint_photo,
        c.description AS complaint_description,
        c.type AS complaint_type
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      LEFT JOIN complaints c ON cr.complaint_id = c.id
      WHERE cr.assigned_driver_id = ? AND cr.status IN ('assigned', 'in_progress')
      ORDER BY 
        CASE cr.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        cr.created_at ASC
    `;
    const assignedTasks = db.prepare(tasksQuery).all(driver.id);

    const routeQuery = `
      SELECT 
        r.id,
        r.name,
        r.driver_id,
        r.vehicle_id,
        r.status,
        r.total_distance_km,
        r.created_at,
        r.completed_at,
        v.plate_number AS vehicle_plate,
        v.model AS vehicle_model,
        v.fuel_type AS vehicle_fuel_type,
        v.avg_mileage_kmpl AS vehicle_mileage,
        v.tank_capacity AS vehicle_tank_capacity
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.driver_id = ? AND r.status IN ('planned', 'in_progress')
      ORDER BY r.id DESC
      LIMIT 1
    `;

    const route = db.prepare(routeQuery).get(driver.id);

    if (!route && assignedTasks.length === 0) {
      return res.json({
        hasActiveRoute: false,
        hasAssignedTasks: false,
        driver,
        assignedTasks: [],
        message: 'No active route or task currently assigned. Ready for next dispatch.'
      });
    }

    let stops = [];
    let totalStops = 0;
    let collectedStops = 0;
    let skippedStops = 0;
    let pendingStops = 0;
    let estimatedFuelLiters = null;

    if (route) {
      const stopsQuery = `
        SELECT 
          rs.id AS stop_id,
          rs.route_id,
          rs.bin_id,
          rs.stop_order,
          rs.status AS stop_status,
          rs.skip_reason,
          rs.collected_at,
          b.bin_code,
          b.location_name,
          b.latitude,
          b.longitude,
          b.capacity_liters,
          b.current_fill_percent,
          b.status AS bin_status,
          b.last_emptied_at
        FROM route_stops rs
        JOIN bins b ON rs.bin_id = b.id
        WHERE rs.route_id = ?
        ORDER BY rs.stop_order ASC
      `;

      stops = db.prepare(stopsQuery).all(route.id);
      totalStops = stops.length;
      collectedStops = stops.filter((s) => s.stop_status === 'collected').length;
      skippedStops = stops.filter((s) => s.stop_status === 'skipped').length;
      pendingStops = stops.filter((s) => s.stop_status === 'pending').length;

      const mileage = route.vehicle_mileage || 4.0;
      estimatedFuelLiters = route.total_distance_km && mileage > 0
        ? Number((route.total_distance_km / mileage).toFixed(2))
        : null;
    }

    res.json({
      hasActiveRoute: !!route,
      hasAssignedTasks: assignedTasks.length > 0,
      driver,
      assignedTasks,
      route: route ? {
        ...route,
        depot: DEPOT_CONFIG,
        estimated_fuel_liters: estimatedFuelLiters,
        total_stops: totalStops,
        collected_stops: collectedStops,
        skipped_stops: skippedStops,
        pending_stops: pendingStops,
        is_all_completed: pendingStops === 0,
        stops
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/driver/routes/:id/start - Start the route (planned -> in_progress)
router.put('/routes/:id/start', (req, res) => {
  try {
    const routeId = req.params.id;
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    if (!route) return res.status(404).json({ error: 'Route not found.' });

    if (route.driver_id !== driver.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not assigned to this route.' });
    }

    if (route.status === 'in_progress') {
      return res.json({ message: 'Route is already in progress.', route });
    }

    const transaction = db.transaction(() => {
      db.prepare("UPDATE routes SET status = 'in_progress' WHERE id = ?").run(routeId);
      db.prepare("UPDATE drivers SET availability = 'busy' WHERE id = ?").run(route.driver_id);
      if (route.vehicle_id) {
        db.prepare("UPDATE vehicles SET status = 'on_route' WHERE id = ?").run(route.vehicle_id);
      }
    });

    transaction();

    const updatedRoute = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    const io = getIo(req);
    if (io) {
      io.emit('route:updated', updatedRoute);
    }

    saveRouteToMongo(routeId);

    res.json({
      message: 'Route started successfully. Drive safely!',
      route: updatedRoute
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/driver/routes/:id/stops/:stopId - Mark stop Collected or Skipped
router.put('/routes/:id/stops/:stopId', (req, res) => {
  try {
    const { id: routeId, stopId } = req.params;
    const { action, skip_reason } = req.body; // action: 'collect' | 'skip'

    if (!['collect', 'skip'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'collect' or 'skip'." });
    }

    const stop = db.prepare(`
      SELECT rs.*, b.id as bin_id, b.bin_code, b.location_name
      FROM route_stops rs
      JOIN bins b ON rs.bin_id = b.id
      WHERE rs.id = ? AND rs.route_id = ?
    `).get(stopId, routeId);

    if (!stop) {
      return res.status(404).json({ error: 'Route stop not found.' });
    }

    const driver = getDriverFromUser(req.user.id, req.user.role);
    const driverId = driver ? driver.id : 1;

    if (action === 'collect') {
      const result = executeMarkCollected({
        binId: stop.bin_id,
        requestId: null,
        stopId: stop.id,
        driverId,
        req
      });

      const updatedStop = db.prepare('SELECT * FROM route_stops WHERE id = ?').get(stopId);
      const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
      const io = getIo(req);
      if (io) {
        io.emit('stop:updated', updatedStop);
        io.emit('route:updated', route);
      }

      return res.json({
        message: result.notificationMsg,
        stop: updatedStop,
        bin: result.updatedBin
      });
    } else {
      // Skip action
      const reason = skip_reason || 'Driver reported inaccessible/blocked';
      db.prepare(`
        UPDATE route_stops
        SET status = 'skipped',
            skip_reason = ?,
            collected_at = NULL
        WHERE id = ?
      `).run(reason, stopId);

      updateDriverAvailabilityIfDone(driverId);

      const updatedStop = db.prepare('SELECT * FROM route_stops WHERE id = ?').get(stopId);
      const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
      const io = getIo(req);
      if (io) {
        io.emit('stop:updated', updatedStop);
        io.emit('route:updated', route);
      }

      return res.json({
        message: `Stop #${stop.stop_order} skipped.`,
        stop: updatedStop
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/driver/routes/:id/complete - Complete route and log fuel
router.post('/routes/:id/complete', (req, res) => {
  try {
    const routeId = req.params.id;
    const { liters_filled, odometer_km, cost } = req.body;

    if (liters_filled === undefined || odometer_km === undefined) {
      return res.status(400).json({ error: 'liters_filled and odometer_km are required to log route completion fuel.' });
    }

    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    if (!route) return res.status(404).json({ error: 'Route not found.' });

    const fuelLiters = Number(liters_filled);
    const odometer = Number(odometer_km);
    const fuelCost = cost !== undefined ? Number(cost) : Math.round(fuelLiters * 94.5); // ₹94.5/L standard rate

    const transaction = db.transaction(() => {
      // 1. Complete route
      db.prepare(`
        UPDATE routes
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(routeId);

      // 2. Release driver back to available
      if (route.driver_id) {
        db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(route.driver_id);
      }

      // 3. Release vehicle back to available
      if (route.vehicle_id) {
        db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(route.vehicle_id);

        // 4. Save fuel log linked to route and vehicle
        db.prepare(`
          INSERT INTO fuel_logs (vehicle_id, route_id, liters_filled, cost, odometer_km, log_date)
          VALUES (?, ?, ?, ?, ?, CURRENT_DATE)
        `).run(route.vehicle_id, routeId, fuelLiters, fuelCost, odometer);
      }
    });

    transaction();

    const completedRoute = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    const io = getIo(req);
    if (io) {
      io.emit('route:updated', completedRoute);
      io.emit('route:completed', completedRoute);
      io.emit('fuel:logged', { routeId, liters: fuelLiters });
    }

    saveRouteToMongo(routeId);
    if (route.vehicle_id) {
      const fuelRecord = db.prepare('SELECT * FROM fuel_logs WHERE route_id = ? ORDER BY id DESC LIMIT 1').get(routeId);
      if (fuelRecord) {
        saveFuelLogToMongo(fuelRecord);
      }
    }

    res.json({
      message: 'Route marked as completed and fuel log recorded successfully!',
      route: completedRoute,
      fuelLog: {
        route_id: Number(routeId),
        vehicle_id: route.vehicle_id,
        liters_filled: fuelLiters,
        cost: fuelCost,
        odometer_km: odometer
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/driver/routes/history - Completed routes history for driver
router.get('/routes/history', (req, res) => {
  try {
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

    const history = db.prepare(`
      SELECT 
        r.id,
        r.name,
        r.status,
        r.total_distance_km,
        r.created_at,
        r.completed_at,
        v.plate_number AS vehicle_plate,
        v.model AS vehicle_model,
        (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) AS total_stops,
        (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id AND status = 'collected') AS collected_stops,
        (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id AND status = 'skipped') AS skipped_stops,
        fl.liters_filled,
        fl.cost AS fuel_cost
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      LEFT JOIN fuel_logs fl ON fl.route_id = r.id
      WHERE r.driver_id = ? AND r.status = 'completed'
      ORDER BY r.completed_at DESC
      LIMIT 20
    `).all(driver.id);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/driver/profile - Profile and statistics for driver
router.get('/profile', (req, res) => {
  try {
    const driver = getDriverFromUser(req.user.id, req.user.role);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

    const user = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(driver.user_id);
    const vehicle = driver.assigned_vehicle_id
      ? db.prepare('SELECT * FROM vehicles WHERE id = ?').get(driver.assigned_vehicle_id)
      : null;

    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT r.id) AS total_routes_completed,
        COALESCE(SUM(r.total_distance_km), 0) AS total_km_driven,
        (SELECT COUNT(*) FROM route_stops rs JOIN routes r2 ON rs.route_id = r2.id WHERE r2.driver_id = ? AND rs.status = 'collected') AS total_bins_collected
      FROM routes r
      WHERE r.driver_id = ? AND r.status = 'completed'
    `).get(driver.id, driver.id);

    res.json({
      user,
      driver,
      vehicle,
      stats: {
        total_routes_completed: stats.total_routes_completed || 0,
        total_km_driven: Math.round((stats.total_km_driven || 0) * 10) / 10,
        total_bins_collected: stats.total_bins_collected || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
