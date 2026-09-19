import db from '../src/db/index.js';

async function verifyAll() {
  console.log('====================================');
  console.log('AUTOMATED VERIFICATION OF ASSIGNMENT LOGIC');
  console.log('====================================\n');

  // 1. Admin Login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const { token } = await loginRes.json();
  if (!token) throw new Error('Failed to login as admin');
  console.log('✔ Logged in as admin successfully.');

  // 2. Fetch Collection Requests Queue
  const reqRes = await fetch('http://localhost:5000/api/requests', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const requests = await reqRes.json();
  console.log(`\n✔ Retrieved ${requests.length} collection requests.`);

  // Verify Sorting: priority (urgent > high > normal) then oldest first
  console.log('\nVerifying request sorting:');
  const pendingRequests = requests.filter(r => r.status === 'pending');
  pendingRequests.forEach((r, idx) => {
    console.log(`  [${idx + 1}] Req #${r.id} | ${r.bin_code} | Fill: ${r.current_fill_percent}% | Priority: ${r.priority.toUpperCase()} | Source: ${r.source} | Created: ${r.created_at}`);
  });

  const priorityRank = { urgent: 1, high: 2, normal: 3 };
  for (let i = 0; i < pendingRequests.length - 1; i++) {
    const curr = pendingRequests[i];
    const next = pendingRequests[i + 1];
    const rankDiff = (priorityRank[curr.priority] || 4) - (priorityRank[next.priority] || 4);
    if (rankDiff > 0) {
      throw new Error(`Sorting violation: ${curr.priority} appeared before ${next.priority}`);
    }
    if (rankDiff === 0) {
      if (new Date(curr.created_at) > new Date(next.created_at)) {
        throw new Error(`Oldest-first violation for same priority between #${curr.id} and #${next.id}`);
      }
    }
  }
  console.log('✔ Sorting verified: Priority (urgent > high > normal) then oldest first is strictly respected.');

  // 3. Test GET /api/drivers/nearest?binId=XX
  const testReq = pendingRequests[0];
  console.log(`\nTesting /api/drivers/nearest for Bin #${testReq.bin_id} (${testReq.bin_code})...`);
  const nearestRes = await fetch(`http://localhost:5000/api/drivers/nearest?binId=${testReq.bin_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const drivers = await nearestRes.json();
  console.log(`✔ Received ${drivers.length} available drivers.`);
  if (drivers.length > 0) {
    console.log(`  Nearest: ${drivers[0].name} (${drivers[0].distanceKm} km) - isNearest: ${drivers[0].isNearest}`);
    if (!drivers[0].isNearest) throw new Error('Expected first driver to have isNearest = true');
    for (let i = 0; i < drivers.length - 1; i++) {
      if (drivers[i].distanceKm > drivers[i + 1].distanceKm) {
        throw new Error('Drivers are not sorted ascending by distance!');
      }
    }
    console.log('✔ Distance sorting verified: Drivers are strictly sorted nearest-first.');
  }

  // 4. Test Assignment Transaction
  const selectedDriver = drivers[0];
  console.log(`\nAssigning driver #${selectedDriver.id} (${selectedDriver.name}) to Request #${testReq.id}...`);
  const assignRes = await fetch(`http://localhost:5000/api/requests/${testReq.id}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ driver_id: selectedDriver.id })
  });
  const assignResult = await assignRes.json();
  if (!assignRes.ok) throw new Error(assignResult.error || 'Assignment API failed');

  console.log(`✔ Assignment response: ${assignResult.message}`);
  console.log(`  Request status: ${assignResult.request.status}`);
  console.log(`  Assigned Driver: ${assignResult.request.driver_name} (${assignResult.request.driver_vehicle_plate})`);
  console.log(`  Assigned At: ${assignResult.request.assigned_at}`);
  console.log(`  Driver availability: ${assignResult.driver.availability}`);

  if (assignResult.request.status !== 'assigned') throw new Error('Expected request status to be assigned');
  if (assignResult.driver.availability !== 'busy') throw new Error('Expected driver availability to be busy');

  // Verify Vehicle status is on_route
  const vehicle = db.prepare('SELECT status FROM vehicles WHERE plate_number = ?').get(selectedDriver.vehicle_plate);
  console.log(`  Vehicle status: ${vehicle?.status}`);
  if (vehicle && vehicle.status !== 'on_route') throw new Error('Expected vehicle status to be on_route');

  // Verify In-app notification for driver
  const notif = db.prepare(`
    SELECT * FROM notifications 
    WHERE user_id = (SELECT user_id FROM drivers WHERE id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(selectedDriver.id);

  console.log(`  Driver notification created: "${notif?.message}"`);
  const expectedPrefix = `New collection task: Bin ${testReq.bin_code}, ${testReq.location_name}, ${testReq.current_fill_percent}% full`;
  if (!notif || notif.message !== expectedPrefix) {
    throw new Error(`Notification message mismatch. Got "${notif?.message}", expected "${expectedPrefix}"`);
  }
  console.log('✔ In-app driver notification format strictly verified.');

  // 5. Verify direct bin assignment (assign-bin endpoint used by map & complaint drawer)
  console.log('\nTesting direct bin assignment via /api/requests/assign-bin...');
  const availableDriversAfter = await (await fetch(`http://localhost:5000/api/drivers/nearest?binId=2`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })).json();

  if (availableDriversAfter.length > 0) {
    const nextDriver = availableDriversAfter[0];
    const directAssignRes = await fetch('http://localhost:5000/api/requests/assign-bin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ bin_id: 2, driver_id: nextDriver.id, source: 'manual' })
    });
    const directAssignResult = await directAssignRes.json();
    console.log(`✔ Direct bin assign success: Request #${directAssignResult.request.id} status=${directAssignResult.request.status} driver=${directAssignResult.request.driver_name}`);
  }

  console.log('\n====================================');
  console.log('ALL TESTS PASSED WITH 100% COMPLIANCE!');
  console.log('====================================');
}

verifyAll().catch(err => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
