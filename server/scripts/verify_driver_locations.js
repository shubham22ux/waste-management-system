import jwt from 'jsonwebtoken';
import db from '../src/db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'smartwaste_jwt_secret_key_2026';

async function verify() {
  console.log('=== Verifying Driver Locations & Endpoints ===\n');

  // 1. Direct DB check on seeded drivers
  const seededDrivers = db.prepare(`
    SELECT d.id, u.name, d.availability, v.plate_number, d.currentLatitude, d.currentLongitude, d.locationUpdatedAt
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
    ORDER BY d.id ASC
  `).all();

  console.log(`Found ${seededDrivers.length} seeded drivers in database:`);
  seededDrivers.forEach((d) => {
    console.log(`  Driver #${d.id} (${d.name}): lat=${d.currentLatitude}, lng=${d.currentLongitude}, vehicle=${d.plate_number}, updated=${d.locationUpdatedAt}`);
  });

  if (seededDrivers.length !== 5) {
    throw new Error(`Expected 5 drivers, got ${seededDrivers.length}`);
  }

  const coordsSet = new Set(seededDrivers.map(d => `${d.currentLatitude},${d.currentLongitude}`));
  if (coordsSet.size !== 5) {
    throw new Error(`Expected 5 unique coordinate pairs, got ${coordsSet.size}`);
  }
  console.log('\n[PASS] All 5 seeded drivers have unique, scattered starting coordinates.');

  // 2. HTTP API check for GET /api/drivers/locations (Admin Role)
  const adminUser = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  const adminToken = jwt.sign(
    { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const resLocations = await fetch('http://localhost:5000/api/drivers/locations', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (!resLocations.ok) {
    const errText = await resLocations.text();
    throw new Error(`GET /api/drivers/locations failed (${resLocations.status}): ${errText}`);
  }

  const locationsData = await resLocations.json();
  console.log(`\nGET /api/drivers/locations HTTP response status: ${resLocations.status}`);
  console.log(`Returned ${locationsData.length} drivers from API:`);
  locationsData.forEach((d) => {
    console.log(`  ID: ${d.id} | Name: ${d.name} | Plate: ${d.vehicle_plate} | Lat: ${d.currentLatitude} | Lng: ${d.currentLongitude}`);
  });

  if (locationsData.length !== 5) {
    throw new Error(`Expected 5 drivers from API, got ${locationsData.length}`);
  }
  console.log('[PASS] GET /api/drivers/locations successfully returned all 5 drivers with locations.');

  // 3. HTTP API check for POST /api/drivers/me/location (Driver Role)
  const driverUser = db.prepare("SELECT u.*, d.id as driver_id FROM users u JOIN drivers d ON d.user_id = u.id WHERE u.role = 'driver' LIMIT 1").get();
  const driverToken = jwt.sign(
    { id: driverUser.id, name: driverUser.name, email: driverUser.email, role: driverUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const newLat = 12.975000;
  const newLng = 77.605000;

  const resPostLocation = await fetch('http://localhost:5000/api/drivers/me/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${driverToken}`
    },
    body: JSON.stringify({ latitude: newLat, longitude: newLng })
  });

  if (!resPostLocation.ok) {
    const errText = await resPostLocation.text();
    throw new Error(`POST /api/drivers/me/location failed (${resPostLocation.status}): ${errText}`);
  }

  const postResult = await resPostLocation.json();
  console.log(`\nPOST /api/drivers/me/location HTTP response status: ${resPostLocation.status}`);
  console.log(`Updated Driver: ID=${postResult.driver?.id} Lat=${postResult.driver?.currentLatitude} Lng=${postResult.driver?.currentLongitude}`);

  if (postResult.driver?.currentLatitude !== newLat || postResult.driver?.currentLongitude !== newLng) {
    throw new Error('Coordinates were not updated accurately.');
  }
  console.log('[PASS] POST /api/drivers/me/location successfully updated driver location.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
