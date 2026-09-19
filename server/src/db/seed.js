import db from './index.js';
import { createSchema } from './schema.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('[Seed] Starting database seed routine...');

  // Ensure tables exist
  createSchema();

  // Clean existing tables (in correct FK dependency order)
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM complaints;
    DELETE FROM fuel_logs;
    DELETE FROM route_stops;
    DELETE FROM routes;
    DELETE FROM collection_requests;
    DELETE FROM drivers;
    DELETE FROM vehicles;
    DELETE FROM bins;
    DELETE FROM users;

    DELETE FROM sqlite_sequence;
  `);

  const passwordHash = bcrypt.hashSync('password123', 10);

  // 1. Seed Users (1 Admin, 5 Drivers, 3 Citizens)
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone)
    VALUES (?, ?, ?, ?, ?)
  `);

  const adminId = insertUser.run('Admin Controller', 'admin@smartwaste.gov', passwordHash, 'admin', '+91 98765 00001').lastInsertRowid;

  const driverUserIds = [];
  const driverNames = [
    { name: 'Rajesh Kumar', phone: '+91 98765 00002', license: 'KA-01-2022-001' },
    { name: 'Suresh Gowda', phone: '+91 98765 00003', license: 'KA-01-2022-002' },
    { name: 'Anil Sharma', phone: '+91 98765 00004', license: 'KA-01-2022-003' },
    { name: 'Mohammed Ali', phone: '+91 98765 00005', license: 'KA-01-2022-004' },
    { name: 'Venkatesh Murthy', phone: '+91 98765 00006', license: 'KA-01-2022-005' },
  ];

  for (let i = 0; i < driverNames.length; i++) {
    const d = driverNames[i];
    const uid = insertUser.run(d.name, `driver${i + 1}@smartwaste.gov`, passwordHash, 'driver', d.phone).lastInsertRowid;
    driverUserIds.push({ userId: uid, license: d.license });
  }

  const citizenUserIds = [];
  const citizenNames = [
    { name: 'Priya Sharma', email: 'citizen1@gmail.com', phone: '+91 98765 11101' },
    { name: 'Rohan Mehta', email: 'citizen2@gmail.com', phone: '+91 98765 11102' },
    { name: 'Kavitha Reddy', email: 'citizen3@gmail.com', phone: '+91 98765 11103' },
  ];

  for (const c of citizenNames) {
    const uid = insertUser.run(c.name, c.email, passwordHash, 'citizen', c.phone).lastInsertRowid;
    citizenUserIds.push(uid);
  }

  // 2. Seed Bins (25 realistic Bengaluru locations)
  const insertBin = db.prepare(`
    INSERT INTO bins (bin_code, location_name, latitude, longitude, capacity_liters, current_fill_percent, status, last_emptied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const binData = [
    { code: 'B-001', location: 'MG Road Metro Station', lat: 12.9756, lng: 77.6066, capacity: 1200, fill: 92, status: 'active', lastEmptyDaysAgo: 4 },
    { code: 'B-002', location: 'Indiranagar 100ft Road', lat: 12.9784, lng: 77.6408, capacity: 1000, fill: 88, status: 'active', lastEmptyDaysAgo: 3 },
    { code: 'B-003', location: 'Koramangala 5th Block', lat: 12.9345, lng: 77.6265, capacity: 1500, fill: 95, status: 'active', lastEmptyDaysAgo: 5 },
    { code: 'B-004', location: 'HSR Layout Sector 1', lat: 12.9121, lng: 77.6445, capacity: 1000, fill: 75, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-005', location: 'Jayanagar 4th Block', lat: 12.9250, lng: 77.5938, capacity: 1200, fill: 60, status: 'active', lastEmptyDaysAgo: 1 },
    { code: 'B-006', location: 'Whitefield Main Road', lat: 12.9698, lng: 77.7499, capacity: 1500, fill: 82, status: 'active', lastEmptyDaysAgo: 4 },
    { code: 'B-007', location: 'Electronic City Phase 1', lat: 12.8452, lng: 77.6602, capacity: 1000, fill: 45, status: 'active', lastEmptyDaysAgo: 1 },
    { code: 'B-008', location: 'Yelahanka New Town', lat: 13.0991, lng: 77.5971, capacity: 1000, fill: 30, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-009', location: 'Malleshwaram 8th Cross', lat: 13.0031, lng: 77.5704, capacity: 1200, fill: 98, status: 'active', lastEmptyDaysAgo: 6 },
    { code: 'B-010', location: 'Rajajinagar 1st Block', lat: 12.9912, lng: 77.5548, capacity: 1000, fill: 55, status: 'damaged', lastEmptyDaysAgo: 8 },
    { code: 'B-011', location: 'Commercial Street', lat: 12.9822, lng: 77.6083, capacity: 1500, fill: 89, status: 'active', lastEmptyDaysAgo: 3 },
    { code: 'B-012', location: 'Brigade Road Junction', lat: 12.9723, lng: 77.6071, capacity: 1200, fill: 91, status: 'active', lastEmptyDaysAgo: 4 },
    { code: 'B-013', location: 'Domlur Flyover Loop', lat: 12.9609, lng: 77.6387, capacity: 1000, fill: 40, status: 'active', lastEmptyDaysAgo: 1 },
    { code: 'B-014', location: 'Marathahalli Bridge', lat: 12.9592, lng: 77.6974, capacity: 1500, fill: 85, status: 'active', lastEmptyDaysAgo: 4 },
    { code: 'B-015', location: 'Bellandur Tech Park', lat: 12.9260, lng: 77.6762, capacity: 1200, fill: 78, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-016', location: 'BTM Layout 2nd Stage', lat: 12.9166, lng: 77.6101, capacity: 1000, fill: 25, status: 'active', lastEmptyDaysAgo: 1 },
    { code: 'B-017', location: 'Banashankari 3rd Stage', lat: 12.9255, lng: 77.5468, capacity: 1000, fill: 50, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-018', location: 'Hebbal Flyover Circle', lat: 13.0358, lng: 77.5970, capacity: 1200, fill: 68, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-019', location: 'Frazer Town Mosque Road', lat: 12.9968, lng: 77.6133, capacity: 1000, fill: 84, status: 'active', lastEmptyDaysAgo: 4 },
    { code: 'B-020', location: 'Richmond Town Park', lat: 12.9601, lng: 77.6001, capacity: 800, fill: 15, status: 'inactive', lastEmptyDaysAgo: 12 },
    { code: 'B-021', location: 'Ulsoor Lake Promenade', lat: 12.9818, lng: 77.6200, capacity: 1200, fill: 72, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-022', location: 'Basavanagudi Bull Temple', lat: 12.9431, lng: 77.5684, capacity: 1000, fill: 38, status: 'active', lastEmptyDaysAgo: 1 },
    { code: 'B-023', location: 'KR Puram Railway Station', lat: 13.0012, lng: 77.6966, capacity: 1500, fill: 94, status: 'active', lastEmptyDaysAgo: 5 },
    { code: 'B-024', location: 'Sarjapur Road Wipro Gate', lat: 12.9110, lng: 77.6830, capacity: 1200, fill: 62, status: 'active', lastEmptyDaysAgo: 2 },
    { code: 'B-025', location: 'Majestic Bus Stand', lat: 12.9779, lng: 77.5724, capacity: 1500, fill: 96, status: 'active', lastEmptyDaysAgo: 5 },
  ];

  const binIds = [];
  for (const b of binData) {
    const lastEmptied = new Date(Date.now() - b.lastEmptyDaysAgo * 86400000).toISOString();
    const res = insertBin.run(b.code, b.location, b.lat, b.lng, b.capacity, b.fill, b.status, lastEmptied);
    binIds.push(res.lastInsertRowid);
  }

  // 3. Seed Vehicles (5 vehicles)
  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (plate_number, model, fuel_type, tank_capacity, avg_mileage_kmpl, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const vehiclesData = [
    { plate: 'KA-01-EA-1001', model: 'Tata Ace Gold Compactor', fuel: 'Diesel', capacity: 100, mileage: 4.2, status: 'available' },
    { plate: 'KA-01-EA-1002', model: 'Eicher Pro 2059 Heavy Dumper', fuel: 'Diesel', capacity: 150, mileage: 3.5, status: 'available' },
    { plate: 'KA-01-EA-1003', model: 'Mahindra Furio 7 Waste Carrier', fuel: 'Diesel', capacity: 120, mileage: 4.0, status: 'available' },
    { plate: 'KA-01-EA-1004', model: 'BharatBenz 1217C Compactor', fuel: 'Diesel', capacity: 180, mileage: 3.2, status: 'on_route' },
    { plate: 'KA-01-EA-1005', model: 'Ashok Leyland Partner Mini', fuel: 'CNG', capacity: 110, mileage: 5.1, status: 'maintenance' },
  ];

  const vehicleIds = [];
  for (const v of vehiclesData) {
    const res = insertVehicle.run(v.plate, v.model, v.fuel, v.capacity, v.mileage, v.status);
    vehicleIds.push(res.lastInsertRowid);
  }

  // 4. Seed Drivers (5 drivers linked to users & vehicles, scattered a few km apart around Bengaluru city centre)
  const insertDriver = db.prepare(`
    INSERT INTO drivers (user_id, license_number, assigned_vehicle_id, availability, currentLatitude, currentLongitude, locationUpdatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const driverLocations = [
    { lat: 12.9780, lng: 77.6010 }, // ~1.1 km NE (MG Road area)
    { lat: 12.9645, lng: 77.5875 }, // ~1.2 km SW (Lalbagh West area)
    { lat: 12.9835, lng: 77.5850 }, // ~1.7 km NW (Vasanth Nagar area)
    { lat: 12.9590, lng: 77.6080 }, // ~2.0 km SE (Shanti Nagar area)
    { lat: 12.9900, lng: 77.6035 }, // ~2.2 km N (Cantonment area)
  ];

  const driverIds = [];
  const availabilities = ['available', 'available', 'available', 'busy', 'off_duty'];
  for (let i = 0; i < driverUserIds.length; i++) {
    const loc = driverLocations[i];
    const now = new Date().toISOString();
    const res = insertDriver.run(
      driverUserIds[i].userId,
      driverUserIds[i].license,
      vehicleIds[i],
      availabilities[i],
      loc.lat,
      loc.lng,
      now
    );
    driverIds.push(res.lastInsertRowid);
  }

  // 5. Seed Historical Fuel Logs (10 per vehicle over past 90 days)
  const insertFuelLog = db.prepare(`
    INSERT INTO fuel_logs (vehicle_id, route_id, liters_filled, cost, odometer_km, log_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const fuelPricePerLiter = 94.5;
  for (let i = 0; i < vehicleIds.length; i++) {
    const vId = vehicleIds[i];
    const mileage = vehiclesData[i].mileage;
    let baseOdometer = 12000 + i * 2500;

    for (let k = 10; k >= 1; k--) {
      const daysAgo = k * 9;
      const logDate = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
      const liters = Math.floor(40 + Math.random() * 50);
      const cost = Math.round(liters * fuelPricePerLiter);
      
      // Calculate realistic mileage variance (Vehicle 4 degraded to showcase Alert status)
      const healthFactor = i === 3 ? 0.81 : (i === 1 ? 0.92 : 1.01);
      const actualKmDiff = Math.round(liters * (mileage * healthFactor + (Math.random() * 0.3 - 0.15)));
      baseOdometer += actualKmDiff;

      insertFuelLog.run(vId, null, liters, cost, baseOdometer, logDate);
    }
  }

  // 6. Seed Collection Requests (For bins with high fill %)
  const insertRequest = db.prepare(`
    INSERT INTO collection_requests (bin_id, created_at, priority, status, source, assigned_driver_id, assigned_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Critical bins with varied sources and timestamps
  const reqData = [
    { binCode: 'B-009', priority: 'urgent', status: 'pending', source: 'sensor', hoursAgo: 5 },
    { binCode: 'B-025', priority: 'urgent', status: 'pending', source: 'complaint', hoursAgo: 3 },
    { binCode: 'B-003', priority: 'high', status: 'pending', source: 'sensor', hoursAgo: 6 },
    { binCode: 'B-023', priority: 'high', status: 'pending', source: 'manual', hoursAgo: 2 },
    { binCode: 'B-001', priority: 'high', status: 'assigned', source: 'sensor', driverId: driverIds[0], hoursAgo: 8 },
    { binCode: 'B-012', priority: 'normal', status: 'in_progress', source: 'sensor', driverId: driverIds[3], hoursAgo: 4 },
    { binCode: 'B-011', priority: 'normal', status: 'completed', source: 'sensor', completedDaysAgo: 1 },
    { binCode: 'B-006', priority: 'normal', status: 'completed', source: 'sensor', completedDaysAgo: 2 },
  ];

  for (const r of reqData) {
    const binRow = db.prepare('SELECT id FROM bins WHERE bin_code = ?').get(r.binCode);
    if (binRow) {
      const createdAt = r.hoursAgo
        ? new Date(Date.now() - r.hoursAgo * 3600000).toISOString()
        : (r.completedDaysAgo ? new Date(Date.now() - r.completedDaysAgo * 86400000).toISOString() : new Date().toISOString());
      const completedAt = r.completedDaysAgo
        ? new Date(Date.now() - r.completedDaysAgo * 86400000).toISOString()
        : null;
      const assignedAt = r.status === 'assigned' || r.status === 'in_progress'
        ? new Date(Date.now() - (r.hoursAgo ? (r.hoursAgo - 1) : 1) * 3600000).toISOString()
        : null;
      const driverId = r.driverId || null;

      insertRequest.run(
        binRow.id,
        createdAt,
        r.priority,
        r.status,
        r.source || 'manual',
        driverId,
        assignedAt,
        completedAt
      );
    }
  }

  // 7. Seed Routes & Route Stops (Completed & In-Progress historical routes)
  const insertRoute = db.prepare(`
    INSERT INTO routes (name, driver_id, vehicle_id, status, total_distance_km, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertStop = db.prepare(`
    INSERT INTO route_stops (route_id, bin_id, stop_order, status, collected_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Route 1: Completed central route
  const r1Id = insertRoute.run(
    'Central Commercial Sweep #101',
    driverIds[0],
    vehicleIds[0],
    'completed',
    18.4,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() - 75000000).toISOString()
  ).lastInsertRowid;

  const r1Bins = [1, 11, 12, 21]; // bin ids
  for (let idx = 0; idx < r1Bins.length; idx++) {
    insertStop.run(r1Id, r1Bins[idx], idx + 1, 'collected', new Date(Date.now() - (86400000 - idx * 3600000)).toISOString());
  }

  // Route 2: In-Progress South Route
  const r2Id = insertRoute.run(
    'South Bengaluru Sector Route #102',
    driverIds[3],
    vehicleIds[3],
    'in_progress',
    24.6,
    new Date().toISOString(),
    null
  ).lastInsertRowid;

  const r2Bins = [3, 4, 15, 24];
  insertStop.run(r2Id, r2Bins[0], 1, 'collected', new Date().toISOString());
  insertStop.run(r2Id, r2Bins[1], 2, 'pending', null);
  insertStop.run(r2Id, r2Bins[2], 3, 'pending', null);
  insertStop.run(r2Id, r2Bins[3], 4, 'pending', null);

  // 8. Seed Complaints (8 complaints of mixed types)
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (citizen_id, bin_id, type, description, photo_url, status, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const complaintsData = [
    {
      citizenIdx: 0,
      binCode: 'B-009',
      type: 'overflowing_bin',
      desc: 'Bin near Malleshwaram market is overflowing onto the main sidewalk causing foul smell.',
      photo: null,
      status: 'open',
      daysAgo: 1
    },
    {
      citizenIdx: 1,
      binCode: 'B-003',
      type: 'overflowing_bin',
      desc: 'Koramangala 5th block commercial bin has garbage piled up around it.',
      photo: null,
      status: 'in_progress',
      daysAgo: 2
    },
    {
      citizenIdx: 2,
      binCode: 'B-010',
      type: 'damaged_bin',
      desc: 'Bin lid is completely broken and side panel is cracked.',
      photo: null,
      status: 'open',
      daysAgo: 3
    },
    {
      citizenIdx: 0,
      binCode: 'B-023',
      type: 'missed_collection',
      desc: 'Scheduled morning pickup near KR Puram station was missed today.',
      photo: null,
      status: 'in_progress',
      daysAgo: 1
    },
    {
      citizenIdx: 1,
      binCode: 'B-025',
      type: 'overflowing_bin',
      desc: 'Severe overflow near Majestic bus stop entrance.',
      photo: null,
      status: 'open',
      daysAgo: 0
    },
    {
      citizenIdx: 2,
      binCode: null,
      type: 'other',
      desc: 'Illegal dumping reported near 8th Main road vacant plot.',
      photo: null,
      status: 'resolved',
      daysAgo: 5
    },
    {
      citizenIdx: 0,
      binCode: 'B-005',
      type: 'damaged_bin',
      desc: 'Wheel mechanism broken, bin tilting dangerous to pedestrians.',
      photo: null,
      status: 'resolved',
      daysAgo: 6
    },
    {
      citizenIdx: 1,
      binCode: 'B-014',
      type: 'missed_collection',
      desc: 'Collection delayed past 24 hours at Marathahalli bridge bin.',
      photo: null,
      status: 'resolved',
      daysAgo: 4
    }
  ];

  for (const c of complaintsData) {
    const citizenId = citizenUserIds[c.citizenIdx];
    const binRow = c.binCode ? db.prepare('SELECT id FROM bins WHERE bin_code = ?').get(c.binCode) : null;
    const binId = binRow ? binRow.id : null;
    const createdAt = new Date(Date.now() - c.daysAgo * 86400000).toISOString();
    const resolvedAt = c.status === 'resolved' ? new Date(Date.now() - (c.daysAgo - 1) * 86400000).toISOString() : null;

    insertComplaint.run(citizenId, binId, c.type, c.desc, c.photo, c.status, createdAt, resolvedAt);
  }

  // 9. Seed Notifications
  const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertNotification.run(adminId, 'High Fill Alert', 'Bin B-009 at Malleshwaram 8th Cross reached 98% capacity.', 'urgent', 0, new Date().toISOString());
  insertNotification.run(adminId, 'New Complaint Filed', 'Citizen Priya Sharma reported overflowing bin B-009.', 'warning', 0, new Date().toISOString());
  insertNotification.run(driverUserIds[0].userId, 'Route Assigned', 'You have been assigned to Route #101.', 'info', 1, new Date(Date.now() - 86400000).toISOString());

  console.log('[Seed] Database seeding completed successfully!');
  console.log(`[Seed] Created: 1 Admin, 5 Drivers, 3 Citizens`);
  console.log(`[Seed] Created: 25 Bins across Bengaluru`);
  console.log(`[Seed] Created: 5 Vehicles, 50 Fuel Logs, 8 Complaints, Routes & Collection Requests`);
}

seed().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});

