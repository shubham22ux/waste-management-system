import db from '../src/db/index.js';
import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

async function runTest() {
  console.log('=====================================================');
  console.log('E2E TEST: COMPLAINTS 4-STAGE LIFECYCLE & NOTIFICATIONS');
  console.log('=====================================================\n');

  // 1. Connect Socket.IO client
  const socket = io('http://localhost:5000', { transports: ['websocket', 'polling'] });
  const socketEvents = [];

  socket.on('connect', () => {
    console.log('✔ Socket.IO connected.');
  });

  socket.on('complaint:created', (data) => {
    socketEvents.push({ event: 'complaint:created', data });
    console.log(`📡 [Socket Event] "complaint:created" (Ticket #${data.id})`);
  });

  socket.on('complaint:updated', (data) => {
    socketEvents.push({ event: 'complaint:updated', data });
    console.log(`📡 [Socket Event] "complaint:updated" (Ticket #${data.id} -> ${data.status})`);
  });

  socket.on('notification:new', (data) => {
    socketEvents.push({ event: 'notification:new', data });
  });

  // 2. Authentication: Admin, Citizen, Driver
  const adminLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  })).json();
  const adminToken = adminLogin.token;
  console.log('✔ Admin logged in.');

  const citizenLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'citizen1@gmail.com', password: 'password123' })
  })).json();
  const citizenToken = citizenLogin.token;
  const citizenUser = citizenLogin.user;
  console.log(`✔ Citizen logged in: ${citizenUser.name} (ID: ${citizenUser.id}).`);

  const driverLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'driver1@smartwaste.gov', password: 'password123' })
  })).json();
  const driverToken = driverLogin.token;
  console.log(`✔ Driver logged in: ${driverLogin.user.name}.`);

  // Target Bin B-001 (id 1)
  const bin = db.prepare('SELECT * FROM bins WHERE id = 1').get();
  console.log(`✔ Using target bin: ${bin.bin_code} (${bin.location_name})`);

  // Clear any existing active collection requests on bin 1 to keep test clean
  db.prepare("UPDATE collection_requests SET status = 'completed' WHERE bin_id = 1 AND status != 'completed'").run();

  // ------------------------------------------------------------
  // STEP 1: Citizen reports complaint ("Bin is Full / Overflowing", NO photo)
  // ------------------------------------------------------------
  console.log('\n--- Step 1: Citizen reports complaint (no photo attached) ---');
  const reportRes = await fetch('http://localhost:5000/api/complaints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${citizenToken}`
    },
    body: JSON.stringify({
      citizen_id: citizenUser.id,
      bin_id: bin.id,
      type: 'overflowing_bin',
      description: 'Lid cannot close, trash spilling onto walkway near the bus stop.',
      photo_url: null // Form submitted with NO photo
    })
  });

  const complaint = await reportRes.json();
  if (!reportRes.ok) throw new Error(complaint.error || 'Failed to file complaint');
  console.log(`✔ Complaint #${complaint.id} created.`);
  console.log(`  Status: "${complaint.status}" (Expected: open)`);
  console.log(`  Photo attached: ${complaint.photo_url || 'None (Optional photo omitted successfully)'}`);

  if (complaint.status !== 'open') throw new Error(`Expected status 'open', got '${complaint.status}'`);

  // Verify Admin received notification
  const adminNotifs = await (await fetch('http://localhost:5000/api/notifications', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  })).json();
  const newComplaintNotif = adminNotifs.notifications.find(n => n.title === 'New Complaint Filed');
  if (!newComplaintNotif) throw new Error('Admin did not receive "New Complaint Filed" notification');
  console.log(`✔ Admin received notification: "${newComplaintNotif.message}"`);

  // ------------------------------------------------------------
  // STEP 2: Admin prepares request and assigns Driver 1 (Milestone 1)
  // ------------------------------------------------------------
  console.log('\n--- Step 2: Admin assigns Driver 1 to the complaint ---');
  // Prepare collection request linked to complaint
  const prepRes = await fetch(`http://localhost:5000/api/complaints/${complaint.id}/create-request`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const prepData = await prepRes.json();
  console.log(`✔ Collection request prepared: #${prepData.collectionRequest.id} (source: ${prepData.collectionRequest.source})`);

  // Assign driver
  const assignRes = await fetch(`http://localhost:5000/api/requests/${prepData.collectionRequest.id}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ driver_id: 1 })
  });
  const assignData = await assignRes.json();
  console.log(`✔ Driver assigned: ${assignData.message}`);

  // Fetch updated complaint
  const afterAssign = await (await fetch(`http://localhost:5000/api/complaints/${complaint.id}`)).json();
  console.log(`✔ Complaint #${afterAssign.id} status advanced to: "${afterAssign.status}"`);
  console.log(`  Assigned Driver ID: ${afterAssign.assigned_driver_id}`);
  console.log(`  Assigned Driver Name: ${afterAssign.assigned_driver_name}`);

  if (afterAssign.status !== 'assigned') throw new Error(`Expected status 'assigned', got '${afterAssign.status}'`);

  // Verify Citizen received Milestone 1 notification
  const citizenNotifsAfterAssign = await (await fetch('http://localhost:5000/api/notifications', {
    headers: { 'Authorization': `Bearer ${citizenToken}` }
  })).json();
  const assignNotif = citizenNotifsAfterAssign.notifications.find(n => n.title === 'Driver Assigned');
  if (!assignNotif) throw new Error('Citizen did not receive "Driver Assigned" notification');
  console.log(`✔ Citizen received Milestone 1 notification: "${assignNotif.message}"`);

  // ------------------------------------------------------------
  // STEP 3: Driver Marks Bin Collected (Milestone 2)
  // ------------------------------------------------------------
  console.log('\n--- Step 3: Driver marks bin collected ---');
  const collectRes = await fetch(`http://localhost:5000/api/driver/tasks/${prepData.collectionRequest.id}/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  const collectData = await collectRes.json();
  console.log(`✔ Driver collected bin: "${collectData.message}"`);

  // Fetch updated complaint
  const afterCollect = await (await fetch(`http://localhost:5000/api/complaints/${complaint.id}`)).json();
  console.log(`✔ Complaint #${afterCollect.id} status advanced to: "${afterCollect.status}"`);
  console.log(`  Resolution note: "${afterCollect.resolution_note}"`);

  if (afterCollect.status !== 'collected') throw new Error(`Expected status 'collected', got '${afterCollect.status}'`);

  // Verify Citizen received Milestone 2 notification
  const citizenNotifsAfterCollect = await (await fetch('http://localhost:5000/api/notifications', {
    headers: { 'Authorization': `Bearer ${citizenToken}` }
  })).json();
  const collectNotif = citizenNotifsAfterCollect.notifications.find(n => n.title === 'Bin Collected');
  if (!collectNotif) throw new Error('Citizen did not receive "Bin Collected" notification');
  console.log(`✔ Citizen received Milestone 2 notification: "${collectNotif.message}"`);

  // ------------------------------------------------------------
  // STEP 4: Admin Marks Resolved & Notifies Citizen (Milestone 3)
  // ------------------------------------------------------------
  console.log('\n--- Step 4: Admin marks resolved and notifies citizen ---');
  const resolveRes = await fetch(`http://localhost:5000/api/complaints/${complaint.id}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      resolution_note: 'Bin emptied, lid sanitized, and sidewalk perimeter swept clean.'
    })
  });
  const resolveData = await resolveRes.json();
  console.log(`✔ Complaint resolved: "${resolveData.message}"`);

  // Fetch updated complaint
  const afterResolve = await (await fetch(`http://localhost:5000/api/complaints/${complaint.id}`)).json();
  console.log(`✔ Final Complaint #${afterResolve.id} status: "${afterResolve.status}"`);
  console.log(`  Resolved at: ${afterResolve.resolved_at}`);
  console.log(`  Resolution note: "${afterResolve.resolution_note}"`);

  if (afterResolve.status !== 'resolved') throw new Error(`Expected status 'resolved', got '${afterResolve.status}'`);
  if (!afterResolve.resolved_at) throw new Error('Expected resolved_at timestamp to be populated');

  // Verify Citizen received Milestone 3 notification (exact format)
  const citizenNotifsAfterResolve = await (await fetch('http://localhost:5000/api/notifications', {
    headers: { 'Authorization': `Bearer ${citizenToken}` }
  })).json();
  const resolveNotif = citizenNotifsAfterResolve.notifications.find(n => n.title === 'Complaint Resolved');
  if (!resolveNotif) throw new Error('Citizen did not receive "Complaint Resolved" notification');
  console.log(`✔ Citizen received Milestone 3 notification: "${resolveNotif.message}"`);

  const expectedText = `Your complaint about Bin ${bin.bin_code} has been resolved.`;
  if (resolveNotif.message !== expectedText) {
    throw new Error(`Expected notification "${expectedText}", got "${resolveNotif.message}"`);
  }

  // ------------------------------------------------------------
  // STEP 5: Test "Illegal Dumping" Category (no bin required)
  // ------------------------------------------------------------
  console.log('\n--- Step 5: Test "Illegal Dumping" category ---');
  const illegalRes = await fetch('http://localhost:5000/api/complaints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${citizenToken}`
    },
    body: JSON.stringify({
      citizen_id: citizenUser.id,
      bin_id: null,
      type: 'illegal_dumping',
      description: 'Commercial construction debris dumped at the corner of 5th Main road.'
    })
  });
  const illegalComplaint = await illegalRes.json();
  console.log(`✔ "Illegal Dumping" report #${illegalComplaint.id} saved successfully (type: ${illegalComplaint.type}).`);

  // ------------------------------------------------------------
  // STEP 6: Test "Bin is Broken / Damaged" One-Click Damaged Action
  // ------------------------------------------------------------
  console.log('\n--- Step 6: Test "Bin is Broken / Damaged" one-click action ---');
  const damagedRes = await fetch('http://localhost:5000/api/complaints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${citizenToken}`
    },
    body: JSON.stringify({
      citizen_id: citizenUser.id,
      bin_id: 2,
      type: 'damaged_bin',
      description: 'Side hinges sheared off and wheel broken.'
    })
  });
  const damagedComplaint = await damagedRes.json();

  const markDamagedRes = await fetch(`http://localhost:5000/api/complaints/${damagedComplaint.id}/mark-damaged`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const markDamagedData = await markDamagedRes.json();
  console.log(`✔ Damaged action response: "${markDamagedData.message}"`);
  console.log(`  Bin #${markDamagedData.bin.id} (${markDamagedData.bin.bin_code}) status is now: "${markDamagedData.bin.status}" (Grey marker on map)`);

  if (markDamagedData.bin.status !== 'damaged') {
    throw new Error(`Expected bin status to be 'damaged', got '${markDamagedData.bin.status}'`);
  }

  // Wait 1 second for socket events to settle
  await new Promise(r => setTimeout(r, 1000));
  socket.disconnect();

  console.log('\n=====================================================');
  console.log('ALL 4 COMPLAINT STAGES & MILESTONE NOTIFICATIONS VERIFIED!');
  console.log('=====================================================');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
