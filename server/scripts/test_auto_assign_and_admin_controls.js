const BASE_URL = 'http://localhost:5000/api';

async function runAutoAssignAndAdminControlsTest() {
  console.log('--- STARTING AUTO-ASSIGN ON FULL BIN & ADMIN CONTROLS TESTS ---');

  // Step 1: Admin Login
  console.log('\n[1] Logging in as Admin (admin@smartwaste.gov)...');
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@smartwaste.gov',
      password: 'password123'
    })
  });

  if (!adminLoginRes.ok) {
    console.error('FAILED: Admin login failed:', adminLoginRes.status);
    process.exit(1);
  }
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  console.log('Admin token received. Role:', adminData.user.role);

  // Step 2: Fetch all drivers and ensure at least 2 are available
  console.log('\n[2] Fetching drivers and ensuring active available status...');
  const driversRes = await fetch(`${BASE_URL}/drivers`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const drivers = await driversRes.json();
  if (drivers.length < 2) {
    console.error('FAILED: Need at least 2 drivers for test, found:', drivers.length);
    process.exit(1);
  }

  const driver1 = drivers[0];
  const driver2 = drivers[1];

  // Set driver1 to available for the test
  await fetch(`${BASE_URL}/drivers/${driver1.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ availability: 'available' })
  });

  // Step 3: Fetch bins and pick a bin for the test
  console.log('\n[3] Fetching bins...');
  const binsRes = await fetch(`${BASE_URL}/bins`);
  const bins = await binsRes.json();
  const testBin = bins[0];
  console.log(`Picked test bin: ${testBin.bin_code} (Current fill: ${testBin.current_fill_percent}%)`);

  // Clean up any existing active requests on this bin first
  const reqsRes = await fetch(`${BASE_URL}/requests`);
  const reqs = await reqsRes.json();
  for (const r of reqs) {
    if (r.bin_id === testBin.id && ['pending', 'assigned', 'in_progress'].includes(r.status)) {
      await fetch(`${BASE_URL}/requests/${r.id}`, { method: 'DELETE' });
    }
  }

  // Step 4: Simulate bin fill level crossing 85% (FULL BIN)
  console.log(`\n[4] Simulating sensor update: Bin ${testBin.bin_code} becomes full (88% fill)...`);
  const updateBinRes = await fetch(`${BASE_URL}/bins/${testBin.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_fill_percent: 88 })
  });

  if (!updateBinRes.ok) {
    console.error('FAILED: Failed to update bin fill level');
    process.exit(1);
  }
  const updatedBin = await updateBinRes.json();
  console.log(`Bin updated: ${updatedBin.bin_code} is now ${updatedBin.current_fill_percent}% full`);

  // Step 5: Verify collection request was automatically created and assigned to nearest active driver
  console.log('\n[5] Verifying automated assignment to nearest active driver...');
  const checkReqsRes = await fetch(`${BASE_URL}/requests`);
  const allReqs = await checkReqsRes.json();
  const autoAssignedReq = allReqs.find((r) => r.bin_id === testBin.id && r.status === 'assigned');

  if (!autoAssignedReq) {
    console.error('FAILED: No automatically assigned request found for full bin!');
    console.log('All requests on bin:', allReqs.filter((r) => r.bin_id === testBin.id));
    process.exit(1);
  }

  console.log('SUCCESS: Full bin automatically triggered assignment!');
  console.log(`Request ID: ${autoAssignedReq.id}, Status: ${autoAssignedReq.status}`);
  console.log(`Assigned Driver ID: ${autoAssignedReq.assigned_driver_id}, Driver Name: ${autoAssignedReq.driver_name}`);

  // Step 6: Verify the assigned driver is now marked busy
  console.log('\n[6] Verifying assigned driver availability is now "busy"...');
  const checkDriverRes = await fetch(`${BASE_URL}/drivers/${autoAssignedReq.assigned_driver_id}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const driverStatus = await checkDriverRes.json();
  console.log(`Driver ${driverStatus.name} availability is: ${driverStatus.availability}`);
  if (driverStatus.availability !== 'busy') {
    console.error('FAILED: Driver availability should be busy, got:', driverStatus.availability);
    process.exit(1);
  }
  console.log('SUCCESS: Driver availability was automatically set to busy!');

  // Step 7: Admin Control — UNASSIGN Driver
  console.log('\n[7] Admin calls POST /api/requests/:id/unassign to unassign the driver...');
  const unassignRes = await fetch(`${BASE_URL}/requests/${autoAssignedReq.id}/unassign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  });

  if (!unassignRes.ok) {
    const err = await unassignRes.json();
    console.error('FAILED: Unassign request failed:', err);
    process.exit(1);
  }
  const unassignedData = await unassignRes.json();
  console.log('SUCCESS: Unassign response:', unassignedData.message);
  console.log(`Request #${autoAssignedReq.id} new status: ${unassignedData.request.status}, driver_id: ${unassignedData.request.assigned_driver_id}`);

  if (unassignedData.request.status !== 'pending' || unassignedData.request.assigned_driver_id !== null) {
    console.error('FAILED: Request was not returned to pending status with null driver');
    process.exit(1);
  }

  // Step 8: Verify the unassigned driver was restored to available
  console.log('\n[8] Verifying driver is freed and restored to "available"...');
  const checkDriverRes2 = await fetch(`${BASE_URL}/drivers/${autoAssignedReq.assigned_driver_id}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const driverStatus2 = await checkDriverRes2.json();
  console.log(`Driver ${driverStatus2.name} availability is now: ${driverStatus2.availability}`);
  if (driverStatus2.availability !== 'available') {
    console.error('FAILED: Driver should be restored to available, got:', driverStatus2.availability);
    process.exit(1);
  }
  console.log('SUCCESS: Driver restored to available!');

  // Step 9: Admin Control — REASSIGN to a different driver
  console.log(`\n[9] Admin manually reassigns Request #${autoAssignedReq.id} to Driver 2 (${driver2.name})...`);
  const reassignRes = await fetch(`${BASE_URL}/requests/${autoAssignedReq.id}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ driver_id: driver2.id })
  });

  if (!reassignRes.ok) {
    const err = await reassignRes.json();
    console.error('FAILED: Reassign failed:', err);
    process.exit(1);
  }
  const reassignedData = await reassignRes.json();
  console.log('SUCCESS: Request reassigned! Message:', reassignedData.message);
  console.log(`Assigned to Driver: ${reassignedData.driver.name} (ID: ${reassignedData.driver.id})`);

  if (reassignedData.request.assigned_driver_id !== driver2.id || reassignedData.request.status !== 'assigned') {
    console.error('FAILED: Reassign failed to update request record');
    process.exit(1);
  }

  // Clean up: Reset test bin to 25% and delete test request
  await fetch(`${BASE_URL}/bins/${testBin.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_fill_percent: 25 })
  });
  await fetch(`${BASE_URL}/requests/${autoAssignedReq.id}`, { method: 'DELETE' });

  console.log('\n========================================================================');
  console.log('ALL AUTO-ASSIGNMENT & ADMIN CONTROL (ASSIGN/UNASSIGN) TESTS PASSED 100%!');
  console.log('========================================================================');
}

runAutoAssignAndAdminControlsTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
