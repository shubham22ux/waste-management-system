import { connectMongoDB, isMongoConnected } from '../db/mongo.js';
import defaultDb from '../db/index.js';
import {
  User,
  Bin,
  Vehicle,
  Driver,
  CollectionRequest,
  Route,
  FuelLog,
  Complaint,
  Notification
} from '../models/index.js';

/**
 * Synchronizes all SQLite records into MongoDB using upserts.
 * @param {Object} [db] SQLite database instance
 */
export async function syncAllToMongo(db) {
  const activeDb = db || defaultDb;
  if (!isMongoConnected()) {
    await connectMongoDB();
  }
  if (!isMongoConnected()) {
    console.warn('[MongoDB Sync] Skipping sync: MongoDB is not connected.');
    return null;
  }

  try {
    console.log('[MongoDB Sync] Starting full data synchronization from SQLite to MongoDB...');

    // 1. Users
    const users = db.prepare('SELECT id, name, email, password_hash, role, phone, created_at FROM users').all();
    if (users.length > 0) {
      const userOps = users.map((u) => ({
        updateOne: {
          filter: { id: u.id },
          update: { $set: u },
          upsert: true
        }
      }));
      await User.bulkWrite(userOps);
    }

    // 2. Bins
    const bins = db.prepare('SELECT * FROM bins').all();
    if (bins.length > 0) {
      const binOps = bins.map((b) => {
        const baseRate = 3.5 + ((b.id * 7) % 35) / 10;
        const fillRate = Number(baseRate.toFixed(1));
        const rem = Math.max(0, 100 - b.current_fill_percent);
        const hours = b.current_fill_percent >= 100 ? 0 : Number((rem / fillRate).toFixed(1));
        return {
          updateOne: {
            filter: { id: b.id },
            update: {
              $set: {
                ...b,
                fill_rate_per_hour: fillRate,
                estimated_hours_until_full: hours,
                fill_prediction_status: hours === 0 ? 'full_now' : hours < 3 ? 'critical' : hours <= 8 ? 'warning' : 'normal'
              }
            },
            upsert: true
          }
        };
      });
      await Bin.bulkWrite(binOps);
    }

    // 3. Vehicles
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    if (vehicles.length > 0) {
      const vehicleOps = vehicles.map((v) => ({
        updateOne: {
          filter: { id: v.id },
          update: { $set: v },
          upsert: true
        }
      }));
      await Vehicle.bulkWrite(vehicleOps);
    }

    // 4. Drivers
    const drivers = db.prepare('SELECT * FROM drivers').all();
    if (drivers.length > 0) {
      const driverOps = drivers.map((d) => ({
        updateOne: {
          filter: { id: d.id },
          update: { $set: d },
          upsert: true
        }
      }));
      await Driver.bulkWrite(driverOps);
    }

    // 5. Collection Requests
    const requests = db.prepare('SELECT * FROM collection_requests').all();
    if (requests.length > 0) {
      const reqOps = requests.map((r) => ({
        updateOne: {
          filter: { id: r.id },
          update: { $set: r },
          upsert: true
        }
      }));
      await CollectionRequest.bulkWrite(reqOps);
    }

    // 6. Routes with embedded Stops
    const routes = db.prepare('SELECT * FROM routes').all();
    if (routes.length > 0) {
      const routeOps = routes.map((r) => {
        const stops = db.prepare(`
          SELECT rs.*, b.bin_code, b.location_name, b.latitude, b.longitude, b.current_fill_percent
          FROM route_stops rs
          JOIN bins b ON rs.bin_id = b.id
          WHERE rs.route_id = ?
          ORDER BY rs.stop_order ASC
        `).all(r.id);

        return {
          updateOne: {
            filter: { id: r.id },
            update: {
              $set: {
                ...r,
                stops: stops.map((s) => ({
                  id: s.id,
                  stop_id: s.id,
                  bin_id: s.bin_id,
                  bin_code: s.bin_code,
                  location_name: s.location_name,
                  latitude: s.latitude,
                  longitude: s.longitude,
                  current_fill_percent: s.current_fill_percent,
                  stop_order: s.stop_order,
                  status: s.status,
                  skip_reason: s.skip_reason,
                  collected_at: s.collected_at
                }))
              }
            },
            upsert: true
          }
        };
      });
      await Route.bulkWrite(routeOps);
    }

    // 7. Fuel Logs
    const fuelLogs = db.prepare('SELECT * FROM fuel_logs').all();
    if (fuelLogs.length > 0) {
      const fuelOps = fuelLogs.map((fl) => ({
        updateOne: {
          filter: { id: fl.id },
          update: { $set: fl },
          upsert: true
        }
      }));
      await FuelLog.bulkWrite(fuelOps);
    }

    // 8. Complaints
    const complaints = db.prepare('SELECT * FROM complaints').all();
    if (complaints.length > 0) {
      const compOps = complaints.map((c) => ({
        updateOne: {
          filter: { id: c.id },
          update: { $set: c },
          upsert: true
        }
      }));
      await Complaint.bulkWrite(compOps);
    }

    // 9. Notifications
    const notifications = db.prepare('SELECT * FROM notifications').all();
    if (notifications.length > 0) {
      const notifOps = notifications.map((n) => ({
        updateOne: {
          filter: { id: n.id },
          update: { $set: n },
          upsert: true
        }
      }));
      await Notification.bulkWrite(notifOps);
    }

    const counts = {
      users: users.length,
      bins: bins.length,
      vehicles: vehicles.length,
      drivers: drivers.length,
      requests: requests.length,
      routes: routes.length,
      fuelLogs: fuelLogs.length,
      complaints: complaints.length,
      notifications: notifications.length
    };

    console.log('[MongoDB Sync] ✅ Successfully synchronized all records into MongoDB:');
    console.log(`   - Users: ${counts.users}, Bins: ${counts.bins}, Vehicles: ${counts.vehicles}`);
    console.log(`   - Drivers: ${counts.drivers}, Requests: ${counts.requests}, Routes: ${counts.routes}`);
    console.log(`   - Fuel Logs: ${counts.fuelLogs}, Complaints: ${counts.complaints}, Notifications: ${counts.notifications}`);

    return counts;
  } catch (err) {
    console.error('[MongoDB Sync Error]', err.message);
    return null;
  }
}

// --- Live Individual Entity Persistence Helpers ---

export async function saveUserToMongo(user) {
  if (!isMongoConnected() || !user) return;
  try {
    await User.updateOne({ id: user.id }, { $set: user }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save User]', err.message);
  }
}

export async function saveBinToMongo(bin) {
  if (!isMongoConnected() || !bin) return;
  try {
    await Bin.updateOne({ id: bin.id }, { $set: bin }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Bin]', err.message);
  }
}

export async function saveVehicleToMongo(vehicle) {
  if (!isMongoConnected() || !vehicle) return;
  try {
    await Vehicle.updateOne({ id: vehicle.id }, { $set: vehicle }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Vehicle]', err.message);
  }
}

export async function saveDriverToMongo(driver) {
  if (!isMongoConnected() || !driver) return;
  try {
    const updateDoc = {
      ...driver,
      currentLatitude: driver.currentLatitude !== undefined ? driver.currentLatitude : driver.current_latitude,
      currentLongitude: driver.currentLongitude !== undefined ? driver.currentLongitude : driver.current_longitude,
      locationUpdatedAt: driver.locationUpdatedAt || driver.location_updated_at || new Date()
    };
    await Driver.updateOne({ id: driver.id }, { $set: updateDoc }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Driver]', err.message);
  }
}

export async function saveRequestToMongo(req) {
  if (!isMongoConnected() || !req) return;
  try {
    await CollectionRequest.updateOne({ id: req.id }, { $set: req }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Request]', err.message);
  }
}

export async function saveRouteToMongo(routeId, db) {
  if (!isMongoConnected() || !routeId) return;
  const activeDb = db || defaultDb;
  try {
    const route = activeDb.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
    if (!route) return;

    const stops = activeDb.prepare(`
      SELECT rs.*, b.bin_code, b.location_name, b.latitude, b.longitude, b.current_fill_percent
      FROM route_stops rs
      JOIN bins b ON rs.bin_id = b.id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order ASC
    `).all(routeId);

    const doc = {
      ...route,
      stops: stops.map((s) => ({
        id: s.id,
        stop_id: s.id,
        bin_id: s.bin_id,
        bin_code: s.bin_code,
        location_name: s.location_name,
        latitude: s.latitude,
        longitude: s.longitude,
        current_fill_percent: s.current_fill_percent,
        stop_order: s.stop_order,
        status: s.status,
        skip_reason: s.skip_reason,
        collected_at: s.collected_at
      }))
    };

    await Route.updateOne({ id: route.id }, { $set: doc }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Route]', err.message);
  }
}

export async function saveFuelLogToMongo(fuelLog) {
  if (!isMongoConnected() || !fuelLog) return;
  try {
    await FuelLog.updateOne({ id: fuelLog.id }, { $set: fuelLog }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save FuelLog]', err.message);
  }
}

export async function saveComplaintToMongo(complaint) {
  if (!isMongoConnected() || !complaint) return;
  try {
    await Complaint.updateOne({ id: complaint.id }, { $set: complaint }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Complaint]', err.message);
  }
}

export async function saveNotificationToMongo(notif) {
  if (!isMongoConnected() || !notif) return;
  try {
    await Notification.updateOne({ id: notif.id }, { $set: notif }, { upsert: true });
  } catch (err) {
    console.error('[Mongo Live Save Notification]', err.message);
  }
}

export async function deleteFromMongo(modelName, id) {
  if (!isMongoConnected() || !id) return;
  try {
    const models = {
      Bin,
      Complaint,
      Route,
      FuelLog,
      User,
      Vehicle,
      Driver,
      CollectionRequest,
      Notification
    };
    const Model = models[modelName];
    if (Model) {
      await Model.deleteOne({ id: Number(id) });
    }
  } catch (err) {
    console.error(`[Mongo Delete ${modelName}]`, err.message);
  }
}
