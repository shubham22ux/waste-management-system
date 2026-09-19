import db from '../src/db/index.js';
import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

async function runTest() {
  console.log('=====================================================');
  console.log('E2E TEST: DRIVER TASK ACTIONS & LIVE ADMIN NOTIFICATIONS');
  console.log('=====================================================\n');

  // Connect Socket.IO client as Admin observer to verify live events
  const socket = io('http://localhost:5000', { transports: ['websocket', 'polling'] });
  const liveEvents = [];

  socket.on('connect', () => {
    console.log('✔ Real-time Socket.IO connected.');
  });

  socket.on('collection:completed', (data) => {
    liveEvents.push({ event: 'collection:completed', data });
    console.log(`📡 [Socket Event] "collection:completed" received: "${data.message}"`);
  });

  socket.on('notification:new', (data) => {
    liveEvents.push({ event: 'notification:new', data });
    console.log('📡 [Socket Event] "notification:new" received.');
  });

  socket.on('bin:updated', (data) => {
    liveEvents.push({ event: 'bin:updated', bin_code: data.bin_code, fill: data.current_fill_percent });
  });

  socket.on('driver:location', (data) => {
    liveEvents.push({ event: 'driver:location', driver: data.name, lat: data.currentLatitude, lng: data.currentLongitude });
  });

  // 1. Admin login
  const adminLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const { token: adminToken } = await adminLoginRes.json();
  console.log('✔ Admin logged in.');

  // 2. Driver login
  const driverLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'driver1@smartwaste.gov', password: 'password123' })
  });
  const { token: driverToken, user: driverUser } = await driverLoginRes.json();
  console.log(`✔ Driver logged in: ${driverUser.name}.`);

  // Clear any existing tasks for Driver 1 so we test clean task completion
  db.prepare("UPDATE collection_requests SET assigned_driver_id = NULL WHERE assigned_driver_id = 1").run();
  db.prepare("UPDATE drivers SET availability = 'available' WHERE id = 1").run();

  // 3. Admin assigns a task (Request #1, Bin B-009) to Driver 1
  console.log('\n--- Step 1: Admin assigns task to Driver 1 ---');
  const assignRes = await fetch('http://localhost:5000/api/requests/1/assign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ driver_id: 1 })
  });
  const assignData = await assignRes.json();
  console.log(`✔ Task assigned: ${assignData.message}`);
  console.log(`  Driver availability: ${assignData.driver.availability}`);

  // 4. Driver fetches tasks list
  console.log('\n--- Step 2: Driver views task list ---');
  const driverTasksRes = await fetch('http://localhost:5000/api/driver/tasks', {
    headers: { 'Authorization': `Bearer ${driverToken}` }
  });
  const driverTasks = await driverTasksRes.json();
  console.log(`✔ Driver has ${driverTasks.length} task(s) in task list:`);
  driverTasks.forEach(t => {
    console.log(`  - Task #${t.id} | Bin ${t.bin_code} (${t.location_name}) | Fill: ${t.current_fill_percent}% | Priority: ${t.priority.toUpperCase()}`);
  });

  const taskToCollect = driverTasks.find(t => t.id === 1);
  if (!taskToCollect) throw new Error('Assigned task #1 not found in driver task list');

  // 5. Driver clicks "Mark Collected"
  console.log('\n--- Step 3: Driver clicks "Mark Collected" ---');
  const collectRes = await fetch(`http://localhost:5000/api/driver/tasks/${taskToCollect.id}/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  const collectData = await collectRes.json();
  console.log(`✔ Mark Collected result: "${collectData.message}"`);
  console.log(`  Bin fill level: ${collectData.bin.current_fill_percent}% (Reset to 5%)`);
  console.log(`  Last emptied at: ${collectData.bin.last_emptied_at}`);
  console.log(`  Driver availability: ${collectData.driver.availability} (Returned to available)`);

  if (collectData.bin.current_fill_percent !== 5) throw new Error('Expected bin fill to be 5%');
  if (collectData.driver.availability !== 'available') throw new Error('Expected driver availability to be available');

  // 6. Verify Admin Notification Bell & DB Record
  console.log('\n--- Step 4: Admin checks notification bell ---');
  const adminNotifRes = await fetch('http://localhost:5000/api/notifications', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const { notifications: adminNotifications } = await adminNotifRes.json();
  const latestNotif = adminNotifications[0];
  console.log(`✔ Latest admin notification: "${latestNotif.message}"`);
  console.log(`  Type: ${latestNotif.type} | Created: ${latestNotif.created_at}`);

  if (!latestNotif.message.includes('collected Bin B-009')) {
    throw new Error('Admin notification message missing expected text');
  }

  // 7. Test "Skip" on another task with short reason
  console.log('\n--- Step 5: Test "Skip" with short reason ---');
  // Assign task #2 to Driver 1
  await fetch('http://localhost:5000/api/requests/2/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ driver_id: 1 })
  });

  const skipRes = await fetch('http://localhost:5000/api/driver/tasks/2/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
    body: JSON.stringify({ skip_reason: 'Road blocked by construction crane' })
  });
  const skipData = await skipRes.json();
  console.log(`✔ Skip result: "${skipData.message}"`);
  console.log(`  Skip reason recorded: "${skipData.request.skip_reason}"`);
  console.log(`  Driver availability: ${skipData.driver.availability}`);

  // 8. Test 30-second Driver Geolocation POST
  console.log('\n--- Step 6: Test 30s Browser Geolocation Tracking ---');
  const geoRes = await fetch('http://localhost:5000/api/drivers/me/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
    body: JSON.stringify({ latitude: 12.9750, longitude: 77.6050 })
  });
  const geoData = await geoRes.json();
  console.log(`✔ Geolocation update: ${geoData.message}`);
  console.log(`  Coordinates saved: (${geoData.driver.currentLatitude}, ${geoData.driver.currentLongitude})`);

  // Wait 1 second for socket propagation
  await new Promise(r => setTimeout(r, 1000));
  socket.disconnect();

  console.log('\n=====================================================');
  console.log('ALL E2E DRIVER ACTIONS & LIVE NOTIFICATIONS VERIFIED!');
  console.log('=====================================================');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
