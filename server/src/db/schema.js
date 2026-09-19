import db from './index.js';

export function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'driver', 'citizen')),
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bin_code TEXT UNIQUE NOT NULL,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      capacity_liters INTEGER DEFAULT 1000,
      current_fill_percent INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'damaged', 'inactive')),
      last_emptied_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT UNIQUE NOT NULL,
      model TEXT NOT NULL,
      fuel_type TEXT DEFAULT 'Diesel',
      tank_capacity REAL DEFAULT 150.0,
      avg_mileage_kmpl REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'on_route', 'maintenance'))
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      license_number TEXT UNIQUE NOT NULL,
      assigned_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available', 'busy', 'off_duty')),
      currentLatitude REAL,
      currentLongitude REAL,
      locationUpdatedAt DATETIME
    );

    CREATE TABLE IF NOT EXISTS collection_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bin_id INTEGER NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
      assigned_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      assigned_at DATETIME,
      source TEXT NOT NULL DEFAULT 'sensor' CHECK(source IN ('sensor', 'complaint', 'manual')),
      complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'in_progress', 'completed', 'skipped')),
      completed_at DATETIME,
      skip_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'completed')),
      total_distance_km REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      bin_id INTEGER NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
      stop_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'collected', 'skipped')),
      skip_reason TEXT,
      collected_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
      liters_filled REAL NOT NULL,
      cost REAL NOT NULL,
      odometer_km REAL NOT NULL,
      log_date DATE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES bins(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('overflowing_bin', 'damaged_bin', 'missed_collection', 'illegal_dumping', 'other')),
      description TEXT NOT NULL,
      photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'assigned', 'collected', 'resolved', 'in_progress')),
      assigned_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      resolution_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe column migration for route_stops.skip_reason
  try {
    db.exec("ALTER TABLE route_stops ADD COLUMN skip_reason TEXT;");
  } catch (err) {
    // Column already exists, ignore
  }

  // Safe column migration for complaints fields
  try {
    db.exec("ALTER TABLE complaints ADD COLUMN resolution_note TEXT;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE complaints ADD COLUMN assigned_driver_id INTEGER;");
  } catch (err) {}

  // Safe migration for complaints status & type check constraints
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaints'").get();
    if (tableInfo && tableInfo.sql && (!tableInfo.sql.includes("'assigned'") || !tableInfo.sql.includes("'illegal_dumping'"))) {
      db.exec(`
        PRAGMA foreign_keys=off;
        CREATE TABLE complaints_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          citizen_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          bin_id INTEGER REFERENCES bins(id) ON DELETE SET NULL,
          type TEXT NOT NULL CHECK(type IN ('overflowing_bin', 'damaged_bin', 'missed_collection', 'illegal_dumping', 'other')),
          description TEXT NOT NULL,
          photo_url TEXT,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'assigned', 'collected', 'resolved', 'in_progress')),
          assigned_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
          resolution_note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME
        );
        INSERT INTO complaints_new (id, citizen_id, bin_id, type, description, photo_url, status, assigned_driver_id, resolution_note, created_at, resolved_at)
        SELECT id, citizen_id, bin_id, type, description, photo_url, status, assigned_driver_id, resolution_note, created_at, resolved_at FROM complaints;
        DROP TABLE complaints;
        ALTER TABLE complaints_new RENAME TO complaints;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (err) {
    // Ignore migration errors
  }

  // Safe column migration for drivers location fields
  try {
    db.exec("ALTER TABLE drivers ADD COLUMN currentLatitude REAL;");
  } catch (err) {
    // Column already exists, ignore
  }
  try {
    db.exec("ALTER TABLE drivers ADD COLUMN currentLongitude REAL;");
  } catch (err) {
    // Column already exists, ignore
  }
  // Safe column migration for collection_requests assignment & source fields
  try {
    db.exec("ALTER TABLE collection_requests ADD COLUMN assigned_driver_id INTEGER;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE collection_requests ADD COLUMN assigned_at DATETIME;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE collection_requests ADD COLUMN source TEXT DEFAULT 'sensor';");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE collection_requests ADD COLUMN complaint_id INTEGER;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE collection_requests ADD COLUMN skip_reason TEXT;");
  } catch (err) {}

  // Safe migration for collection_requests status check constraint to include 'skipped'
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='collection_requests'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'skipped'")) {
      db.exec(`
        PRAGMA foreign_keys=off;
        CREATE TABLE collection_requests_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bin_id INTEGER NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
          assigned_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
          assigned_at DATETIME,
          source TEXT NOT NULL DEFAULT 'sensor' CHECK(source IN ('sensor', 'complaint', 'manual')),
          complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high', 'urgent')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'in_progress', 'completed', 'skipped')),
          completed_at DATETIME,
          skip_reason TEXT
        );
        INSERT INTO collection_requests_new (id, bin_id, assigned_driver_id, assigned_at, source, complaint_id, created_at, priority, status, completed_at, skip_reason)
        SELECT id, bin_id, assigned_driver_id, assigned_at, source, complaint_id, created_at, priority, status, completed_at, skip_reason FROM collection_requests;
        DROP TABLE collection_requests;
        ALTER TABLE collection_requests_new RENAME TO collection_requests;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (err) {
    // Ignore migration errors
  }

  console.log('[Database] Schema created/verified successfully.');
}

