import db from '../db/index.js';
import { saveBinToMongo, saveRequestToMongo, saveDriverToMongo } from './mongoSync.js';
import { autoAssignFullBin } from './dispatcher.js';

let simulatorInterval = null;
let driverMovementInterval = null;

export function startIoTSimulator(io) {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
  }

  console.log('[IoT Simulator] Background sensor service active (running every 15s).');

  // Start demo-only driver GPS movement simulation
  startDriverMovementSimulator(io);

  simulatorInterval = setInterval(() => {
    try {
      // Find active bins that are not completely full yet
      const activeBins = db.prepare(`
        SELECT * FROM bins
        WHERE status = 'active' AND current_fill_percent < 100
      `).all();

      if (activeBins.length === 0) return;

      // Pick 2 to 4 random bins to simulate sensor updates
      const numToUpdate = Math.min(activeBins.length, Math.floor(Math.random() * 3) + 2);
      const shuffled = activeBins.sort(() => 0.5 - Math.random());
      const selectedBins = shuffled.slice(0, numToUpdate);

      for (const bin of selectedBins) {
        const fillIncrement = Math.floor(Math.random() * 9) + 2; // 2% to 10%
        const newFill = Math.min(100, bin.current_fill_percent + fillIncrement);

        // Update database
        db.prepare(`
          UPDATE bins
          SET current_fill_percent = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newFill, bin.id);

        const updatedBin = db.prepare('SELECT * FROM bins WHERE id = ?').get(bin.id);

        // Broadcast live update over Socket.IO
        io.emit('bin:updated', updatedBin);
        saveBinToMongo(updatedBin);

        // Check if bin fill >= 80% and trigger automated nearest-driver dispatch
        if (newFill >= 80) {
          autoAssignFullBin(updatedBin, io);
        }
      }
    } catch (err) {
      console.error('[IoT Simulator Error]', err.message);
    }
  }, 15000);
}

/**
 * DEMO-ONLY: Simulates real-time GPS vehicle movement by nudging each driver's
 * position by a tiny random amount every 10 seconds during presentations/demos.
 */
export function startDriverMovementSimulator(io) {
  if (driverMovementInterval) {
    clearInterval(driverMovementInterval);
  }

  console.log('[Driver Movement Simulator] (DEMO-ONLY) Background driver GPS movement active (running every 10s).');

  driverMovementInterval = setInterval(() => {
    try {
      const drivers = db.prepare(`
        SELECT d.id, d.user_id, u.name, u.phone, d.availability, v.plate_number AS vehicle_plate,
               d.currentLatitude, d.currentLongitude, d.locationUpdatedAt,
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
        WHERE d.currentLatitude IS NOT NULL AND d.currentLongitude IS NOT NULL
      `).all();

      if (drivers.length === 0) return;

      for (const driver of drivers) {
        // Nudge position slightly: delta between -0.0003 and +0.0003 (~25-35 meters)
        const latDelta = (Math.random() - 0.5) * 0.0006;
        const lngDelta = (Math.random() - 0.5) * 0.0006;
        const newLat = Number((driver.currentLatitude + latDelta).toFixed(6));
        const newLng = Number((driver.currentLongitude + lngDelta).toFixed(6));
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE drivers
          SET currentLatitude = ?,
              currentLongitude = ?,
              locationUpdatedAt = ?
          WHERE id = ?
        `).run(newLat, newLng, now, driver.id);

        const updatedDriver = {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          availability: driver.availability,
          vehicle_plate: driver.vehicle_plate,
          vehiclePlate: driver.vehicle_plate,
          currentLatitude: newLat,
          currentLongitude: newLng,
          current_latitude: newLat,
          current_longitude: newLng,
          locationUpdatedAt: now,
          location_updated_at: now,
          current_task: driver.current_task,
          currentTask: driver.current_task
        };

        // Emit Socket.IO event "driver:location" whenever a driver's position changes
        io.emit('driver:location', updatedDriver);
        saveDriverToMongo(updatedDriver);
      }
    } catch (err) {
      console.error('[Driver Movement Simulator Error]', err.message);
    }
  }, 10000);
}

