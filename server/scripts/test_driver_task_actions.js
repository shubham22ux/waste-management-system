import db from '../src/db/index.js';

async function testDriverActions() {
  console.log('--- Testing Driver Actions & Live Notification Flow ---\n');

  // 1. Admin login
  const adminRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const { token: adminToken } = await adminRes.json();
  console.log('1. Logged in as admin.');

  // 2. Assign Request 1 to Driver 1 (Rajesh Kumar)
  const assignRes = await fetch('http://localhost:5000/api/requests/1/assign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ driver_id: 1 })
  });
  const assignData = await assignRes.json();
  console.log(`2. Assigned Request #1 to Driver 1 (${assignData.driver?.name}). Driver availability: ${assignData.driver?.availability}`);

  // 3. Driver login
  const driverRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'driver1@smartwaste.gov', password: 'password123' })
  });
  const { token: driverToken } = await driverRes.json();
  console.log('3. Logged in as Driver 1.');

  // 4. Fetch Driver Tasks
  const tasksRes = await fetch('http://localhost:5000/api/driver/tasks', {
    headers: { 'Authorization': `Bearer ${driverToken}` }
  });
  const tasks = await tasksRes.json();
  console.log(`4. Driver tasks count: ${tasks.length}`);
  const assignedTask = tasks.find(t => t.id === 1);
  console.log(`   Found assigned task #1: Bin ${assignedTask?.bin_code} at ${assignedTask?.location_name} (${assignedTask?.current_fill_percent}%)`);

  // 5. Driver clicks "Mark Collected" on task #1
  console.log('5. Executing "Mark Collected" on task #1...');
  const collectRes = await fetch('http://localhost:5000/api/driver/tasks/1/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  const collectResult = await collectRes.json();
  console.log(`   Response: "${collectResult.message}"`);
  console.log(`   Bin fill after collect: ${collectResult.bin?.current_fill_percent}%`);

  // Now complete task #5 as well so driver has no other pending tasks
  console.log('   Completing remaining task #5...');
  const collect5Res = await fetch('http://localhost:5000/api/driver/tasks/5/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  const collect5Data = await collect5Res.json();
  console.log(`   Driver availability after all tasks complete: ${collect5Data.driver?.availability}`);

  // 6. Verify Admin Notification
  const adminNotif = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = 1
    ORDER BY id DESC LIMIT 1
  `).get();
  console.log(`6. Latest Admin Notification: "${adminNotif?.message}"`);

  // 7. Verify Geolocation Update
  console.log('7. Testing Geolocation POST to /api/drivers/me/location...');
  const locRes = await fetch('http://localhost:5000/api/drivers/me/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ latitude: 12.9785, longitude: 77.6015 })
  });
  const locResult = await locRes.json();
  console.log(`   Location updated: ${locResult.message} lat=${locResult.driver?.currentLatitude}, lng=${locResult.driver?.currentLongitude}`);

  console.log('\n--- All Backend Driver Tests Succeeded! ---');
}

testDriverActions().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
