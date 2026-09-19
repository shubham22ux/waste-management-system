import express from 'express';
import db from '../db/index.js';
import { DEPOT_CONFIG } from '../config/depot.js';
import { optimizeRoute, clusterRequestsIntoBatches } from '../services/optimizer.js';
import { saveRouteToMongo, deleteFromMongo } from '../services/mongoSync.js';

const router = express.Router();

const getIo = (req) => req.app.get('io');

const routeListQuery = `
  SELECT 
    r.id,
    r.name,
    r.driver_id,
    r.vehicle_id,
    r.status,
    r.total_distance_km,
    r.created_at,
    r.completed_at,
    u.name AS driver_name,
    u.phone AS driver_phone,
    v.plate_number AS vehicle_plate,
    v.model AS vehicle_model,
    v.fuel_type AS vehicle_fuel_type,
    v.avg_mileage_kmpl AS vehicle_mileage,
    (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) AS stop_count,
    (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id AND status = 'collected') AS completed_stop_count
  FROM routes r
  LEFT JOIN drivers d ON r.driver_id = d.id
  LEFT JOIN users u ON d.user_id = u.id
  LEFT JOIN vehicles v ON r.vehicle_id = v.id
`;

// GET /api/routes - List all routes
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = routeListQuery + ' WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.id DESC';
    const routes = db.prepare(sql).all(...params);

    const enriched = routes.map((rt) => {
      const mileage = rt.vehicle_mileage || 4.0;
      const estimatedFuelLiters = rt.total_distance_km && mileage > 0
        ? Number((rt.total_distance_km / mileage).toFixed(2))
        : null;

      return {
        ...rt,
        estimated_fuel_liters: estimatedFuelLiters
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/routes/config/depot - Return depot config
router.get('/config/depot', (req, res) => {
  res.json(DEPOT_CONFIG);
});

// GET /api/routes/:id - Get single route details with stops
router.get('/:id', (req, res) => {
  try {
    const routeId = req.params.id;
    const route = db.prepare(routeListQuery + ' WHERE r.id = ?').get(routeId);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const stopsQuery = `
      SELECT 
        rs.id AS stop_id,
        rs.route_id,
        rs.bin_id,
        rs.stop_order,
        rs.status AS stop_status,
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

    const stops = db.prepare(stopsQuery).all(routeId);

    const mileage = route.vehicle_mileage || 4.0;
    const estimatedFuelLiters = route.total_distance_km && mileage > 0
      ? Number((route.total_distance_km / mileage).toFixed(2))
      : null;

    res.json({
      ...route,
      estimated_fuel_liters: estimatedFuelLiters,
      depot: DEPOT_CONFIG,
      stops
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/routes/generate - Generate optimized routes from pending collection requests
router.post('/generate', (req, res) => {
  try {
    // 1. Fetch pending collection requests with bin details
    const pendingQuery = `
      SELECT 
        cr.id AS request_id,
        cr.bin_id,
        cr.priority,
        cr.created_at AS request_created_at,
        b.bin_code,
        b.location_name,
        b.latitude,
        b.longitude,
        b.current_fill_percent,
        b.capacity_liters
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      WHERE cr.status = 'pending'
    `;

    const pendingRequests = db.prepare(pendingQuery).all();

    if (pendingRequests.length === 0) {
      return res.status(400).json({
        error: 'No pending collection requests found. Create or wait for requests to generate routes.'
      });
    }

    // 2. Group up to 10 bins per route using spatial-priority clustering
    const batches = clusterRequestsIntoBatches(pendingRequests, 10, DEPOT_CONFIG);

    const createdRoutes = [];

    const transaction = db.transaction(() => {
      // Find available drivers with available vehicles
      const availableDriversQuery = `
        SELECT 
          d.id AS driver_id,
          d.assigned_vehicle_id,
          v.id AS vehicle_id,
          v.avg_mileage_kmpl
        FROM drivers d
        JOIN vehicles v ON d.assigned_vehicle_id = v.id
        WHERE d.availability = 'available' AND v.status = 'available'
        ORDER BY d.id ASC
      `;
      const availableDrivers = db.prepare(availableDriversQuery).all();

      let driverIdx = 0;

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];

        // 3. Optimize sequence starting from fixed Depot using Nearest Neighbor + 2-Opt
        const optimizationResult = optimizeRoute(batch, DEPOT_CONFIG);
        const { orderedStops, totalDistanceKm } = optimizationResult;

        // Drivers and vehicles are not auto-assigned (manual assignment required)
        let assignedDriverId = null;
        let assignedVehicleId = null;

        // Determine sensible descriptive name for route
        const firstArea = (batch[0].location_name || '').split(' ')[0] || 'Sector';
        const lastArea = (batch[batch.length - 1].location_name || '').split(' ')[0] || 'Zone';
        const routeName = `Route #${Date.now().toString().slice(-4)}: ${firstArea} - ${lastArea} (${batch.length} stops)`;

        // Insert route record
        const insertRouteStmt = db.prepare(`
          INSERT INTO routes (name, driver_id, vehicle_id, status, total_distance_km, created_at)
          VALUES (?, ?, ?, 'planned', ?, CURRENT_TIMESTAMP)
        `);
        const routeInfo = insertRouteStmt.run(
          routeName,
          assignedDriverId,
          assignedVehicleId,
          totalDistanceKm
        );
        const routeId = routeInfo.lastInsertRowid;

        // Insert ordered route stops
        const insertStopStmt = db.prepare(`
          INSERT INTO route_stops (route_id, bin_id, stop_order, status)
          VALUES (?, ?, ?, 'pending')
        `);

        for (let sIdx = 0; sIdx < orderedStops.length; sIdx++) {
          insertStopStmt.run(routeId, orderedStops[sIdx].bin_id, sIdx + 1);
        }

        // Update linked collection requests to 'assigned'
        const requestIds = batch.map((r) => r.request_id);
        const placeholders = requestIds.map(() => '?').join(',');
        db.prepare(
          `UPDATE collection_requests SET status = 'assigned' WHERE id IN (${placeholders})`
        ).run(...requestIds);

        // Notify assigned driver or alert admins if unassigned
        if (assignedDriverId) {
          const driverUser = db.prepare('SELECT user_id FROM drivers WHERE id = ?').get(assignedDriverId);
          if (driverUser) {
            const notifMsg = `New route assigned: ${orderedStops.length} stops, ${totalDistanceKm} km`;
            const notifStmt = db.prepare(`
              INSERT INTO notifications (user_id, title, message, type, created_at)
              VALUES (?, 'New Route Assigned', ?, 'info', CURRENT_TIMESTAMP)
            `);
            notifStmt.run(driverUser.user_id, notifMsg);
          }
        } else {
          // Notify all admins that route is unassigned
          const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
          const adminNotifStmt = db.prepare(`
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, 'Unassigned Route Alert', ?, 'warning', CURRENT_TIMESTAMP)
          `);
          admins.forEach((adm) => {
            adminNotifStmt.run(adm.id, `Route created (${orderedStops.length} stops, ${totalDistanceKm} km) but no drivers were available for auto-assignment.`);
          });
        }

        // Fetch newly created route to return
        const createdRoute = db.prepare(routeListQuery + ' WHERE r.id = ?').get(routeId);
        createdRoutes.push(createdRoute);
      }

      return createdRoutes;
    });

    const results = transaction();

    // Emit real-time events via Socket.IO
    const io = getIo(req);
    if (io) {
      results.forEach((r) => {
        io.emit('route:created', r);
      });
      io.emit('requests:updated');
      io.emit('notification:new');
    }

    results.forEach((r) => {
      saveRouteToMongo(r.id);
    });

    res.status(201).json({
      message: `Successfully generated ${results.length} optimized route(s) from ${pendingRequests.length} pending requests.`,
      routes: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/routes/:id/assign - Assign or change driver and vehicle for a route
router.put('/:id/assign', (req, res) => {
  try {
    const routeId = req.params.id;
    const { driver_id, vehicle_id } = req.body;

    const existing = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    if (!existing) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const transaction = db.transaction(() => {
      // If previous driver existed, reset availability if planned
      if (existing.driver_id && existing.driver_id !== driver_id && existing.status === 'planned') {
        db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(existing.driver_id);
      }
      if (existing.vehicle_id && existing.vehicle_id !== vehicle_id && existing.status === 'planned') {
        db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(existing.vehicle_id);
      }

      // Assign new
      if (driver_id) {
        db.prepare("UPDATE drivers SET availability = 'busy' WHERE id = ?").run(driver_id);
      }
      if (vehicle_id) {
        db.prepare("UPDATE vehicles SET status = 'on_route' WHERE id = ?").run(vehicle_id);
      }

      db.prepare(`
        UPDATE routes
        SET driver_id = ?, vehicle_id = ?
        WHERE id = ?
      `).run(driver_id || null, vehicle_id || null, routeId);

      // If a driver was newly assigned, send notification
      if (driver_id && driver_id !== existing.driver_id) {
        const driverUser = db.prepare('SELECT user_id FROM drivers WHERE id = ?').get(driver_id);
        const stopCountRow = db.prepare('SELECT COUNT(*) as count FROM route_stops WHERE route_id = ?').get(routeId);
        if (driverUser) {
          const notifMsg = `New route assigned: ${stopCountRow?.count || 0} stops, ${existing.total_distance_km} km`;
          db.prepare(`
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, 'New Route Assigned', ?, 'info', CURRENT_TIMESTAMP)
          `).run(driverUser.user_id, notifMsg);
        }
      }
    });

    transaction();

    const updated = db.prepare(routeListQuery + ' WHERE r.id = ?').get(routeId);
    const io = getIo(req);
    if (io) {
      io.emit('route:updated', updated);
      io.emit('notification:new');
    }

    saveRouteToMongo(routeId);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/routes/:id - Delete/cancel a planned route
router.delete('/:id', (req, res) => {
  try {
    const routeId = req.params.id;
    const existing = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    if (!existing) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const transaction = db.transaction(() => {
      // Find bins in this route
      const stops = db.prepare('SELECT bin_id FROM route_stops WHERE route_id = ?').all(routeId);
      const binIds = stops.map((s) => s.bin_id);

      if (binIds.length > 0) {
        const placeholders = binIds.map(() => '?').join(',');
        // Reset collection_requests back to 'pending' if they were 'assigned'
        db.prepare(`
          UPDATE collection_requests
          SET status = 'pending'
          WHERE bin_id IN (${placeholders}) AND status = 'assigned'
        `).run(...binIds);
      }

      // Release driver and vehicle if route was planned
      if (existing.status === 'planned') {
        if (existing.driver_id) {
          db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(existing.driver_id);
        }
        if (existing.vehicle_id) {
          db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(existing.vehicle_id);
        }
      }

      // Delete route stops and route
      db.prepare('DELETE FROM route_stops WHERE route_id = ?').run(routeId);
      db.prepare('DELETE FROM routes WHERE id = ?').run(routeId);
    });

    transaction();

    const io = getIo(req);
    if (io) {
      io.emit('route:deleted', { id: Number(routeId) });
      io.emit('requests:updated');
    }

    deleteFromMongo('Route', routeId);

    res.json({ message: 'Route deleted and pending requests unassigned', id: Number(routeId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
