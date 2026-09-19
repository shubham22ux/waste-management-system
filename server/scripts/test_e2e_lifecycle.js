const API_BASE = 'http://localhost:5000/api';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runE2ELifecycleTest() {
  console.log('🚀 Starting SmartWaste 10-Step Full Lifecycle End-to-End Test...\n');

  // Step 0: Admin Login to get token
  console.log('--- Step 0: Admin Authentication ---');
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.ok && adminLoginData.token, 'Admin authenticated successfully');
  const adminToken = adminLoginData.token;

  // Step 1: Citizen Registration
  console.log('\n--- Step 1: Citizen Registration ---');
  const timestamp = Date.now();
  const citizenEmail = `citizen_test_${timestamp}@example.com`;
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Ramesh Kumar ${timestamp}`,
      email: citizenEmail,
      password: 'password123',
      phone: '+91 98765 43210'
    })
  });
  const registerData = await registerRes.json();
  assert(registerRes.ok && registerData.user?.id, `Citizen registered successfully: ID ${registerData.user?.id}`);
  const citizen = registerData.user;
  const citizenToken = registerData.token;

  // Step 2: Citizen files complaint for Bin #1
  console.log('\n--- Step 2: Citizen Files Overflowing Bin Complaint ---');
  const binsRes = await fetch(`${API_BASE}/bins`);
  const bins = await binsRes.json();
  assert(bins.length > 0, `Fetched ${bins.length} municipal bins from system`);
  const targetBin = bins[0];

  const complaintRes = await fetch(`${API_BASE}/complaints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${citizenToken}`
    },
    body: JSON.stringify({
      citizen_id: citizen.id,
      bin_id: targetBin.id,
      type: 'overflowing_bin',
      description: 'Severe trash spillage near bus stop shelter. Odor spreading to footpath.',
      photo_url: '/uploads/sample_overflow.jpg'
    })
  });
  const complaintData = await complaintRes.json();
  assert(complaintRes.ok && complaintData.id, `Complaint filed: Ticket #${complaintData.id} for Bin ${targetBin.bin_code}`);
  const complaintId = complaintData.id;

  // Step 3: Admin converts complaint to urgent collection request
  console.log('\n--- Step 3: Admin Converts Complaint to Urgent Collection Request ---');
  const urgentReqRes = await fetch(`${API_BASE}/complaints/${complaintId}/create-request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const urgentReqData = await urgentReqRes.json();
  assert(urgentReqRes.ok && urgentReqData.collectionRequest?.id, `Urgent Collection Request #${urgentReqData.collectionRequest?.id} generated`);
  assert(urgentReqData.complaint?.status === 'in_progress', `Complaint #${complaintId} automatically marked as 'in_progress'`);

  // Step 4: Verify collection requests queue
  console.log('\n--- Step 4: Verify Collection Requests Queue ---');
  const pendingRequestsRes = await fetch(`${API_BASE}/requests?status=pending`);
  const pendingRequests = await pendingRequestsRes.json();
  assert(pendingRequests.length >= 1, `Pending collection requests queue contains ${pendingRequests.length} requests`);

  // Step 5: Route Optimization with Nearest Neighbor + 2-opt
  console.log('\n--- Step 5: Route Generation & Optimization ---');
  const routeGenRes = await fetch(`${API_BASE}/routes/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ max_bins_per_route: 10 })
  });
  const routeGenData = await routeGenRes.json();
  assert(routeGenRes.ok && routeGenData.routes?.length >= 1, `Generated ${routeGenData.routes?.length} optimized route(s)`);
  const generatedRoute = routeGenData.routes[0];
  console.log(`   Route #${generatedRoute.id} details: ${generatedRoute.name}, Distance: ${generatedRoute.total_distance_km} km`);
  assert(generatedRoute.total_distance_km >= 0, 'Route total distance calculated');

  // Step 6: Driver Assignment Check
  console.log('\n--- Step 6: Driver Assignment Check ---');
  let routeWithDriver = await (await fetch(`${API_BASE}/routes/${generatedRoute.id}`)).json();
  if (!routeWithDriver.driver_id) {
    console.log('   Auto-assignment had no available driver. Assigning first driver manually...');
    const driversRes = await fetch(`${API_BASE}/drivers`);
    const drivers = await driversRes.json();
    const targetDriver = drivers[0];
    const assignRes = await fetch(`${API_BASE}/routes/${generatedRoute.id}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ driver_id: targetDriver.id })
    });
    assert(assignRes.ok, `Driver ${targetDriver.name} assigned to Route #${generatedRoute.id}`);
    routeWithDriver = await (await fetch(`${API_BASE}/routes/${generatedRoute.id}`)).json();
  }
  assert(routeWithDriver.driver_id, `Route #${routeWithDriver.id} successfully assigned to Driver ID ${routeWithDriver.driver_id}`);

  // Step 7: Driver Starts Route Execution
  console.log('\n--- Step 7: Driver Starts Route Execution ---');
  const startRouteRes = await fetch(`${API_BASE}/driver/routes/${generatedRoute.id}/start`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    }
  });
  const startRouteData = await startRouteRes.json();
  assert(startRouteRes.ok, `Route #${generatedRoute.id} status changed to 'in_progress'`);

  // Step 8: Driver Visits & Collects Stops
  console.log('\n--- Step 8: Driver Collects Stops & Resets Bin Fills ---');
  const stops = routeWithDriver.stops || [];
  assert(stops.length > 0, `Route contains ${stops.length} stop(s)`);

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const stopId = stop.stop_id || stop.id;
    const collectRes = await fetch(`${API_BASE}/driver/routes/${generatedRoute.id}/stops/${stopId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: 'collect' })
    });
    const collectData = await collectRes.json();
    if (!collectRes.ok) {
      console.error('Stop collect failed:', collectRes.status, collectData);
    }
    assert(collectRes.ok, `Stop #${stop.stop_order} (Bin ${stop.bin_code}) marked as Collected. Bin fill reset to 5%`);
  }

  // Step 9: Driver Completes Route and Logs Fuel
  console.log('\n--- Step 9: Driver Completes Route & Logs End-of-Route Fuel ---');
  const completeRouteRes = await fetch(`${API_BASE}/driver/routes/${generatedRoute.id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      liters_filled: 24.5,
      odometer_km: 45800,
      cost: 2315.0
    })
  });
  const completeRouteData = await completeRouteRes.json();
  assert(completeRouteRes.ok, `Route #${generatedRoute.id} marked as 'completed' and fuel logged`);

  // Verify target bin fill level was reset in DB
  const verifiedBinRes = await fetch(`${API_BASE}/bins/${targetBin.id}`);
  const verifiedBin = await verifiedBinRes.json();
  assert(verifiedBin.current_fill_percent === 5, `Target Bin ${verifiedBin.bin_code} fill level verified reset to 5%`);

  // Step 10: Admin Resolves Citizen Complaint
  console.log('\n--- Step 10: Admin Resolves Citizen Complaint ---');
  const resolveComplaintRes = await fetch(`${API_BASE}/complaints/${complaintId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: 'resolved',
      resolution_note: `Sanitation crew completed collection on Route #${generatedRoute.id}. Area sanitized and bin emptied to 5%.`
    })
  });
  const resolvedComplaint = await resolveComplaintRes.json();
  assert(resolvedComplaint.status === 'resolved', `Complaint #${complaintId} marked as 'resolved'`);
  assert(resolvedComplaint.resolved_at !== null, 'Complaint resolved_at timestamp populated');

  // Step 11: Verify Citizen Received Notifications
  console.log('\n--- Step 11: Verify Notification Pipeline ---');
  const citizenNotifsRes = await fetch(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${citizenToken}` }
  });
  const citizenNotifsData = await citizenNotifsRes.json();
  const citizenNotifs = citizenNotifsData.notifications || [];
  assert(citizenNotifs.length >= 1, `Citizen received ${citizenNotifs.length} notification(s): "${citizenNotifs[0]?.title}"`);

  // Step 12: Verify Dashboard Activity Feed
  console.log('\n--- Step 12: Verify Dashboard Activity Feed ---');
  const activityRes = await fetch(`${API_BASE}/dashboard/activity`);
  const activities = await activityRes.json();
  assert(activities.length >= 3, `Activity feed recorded ${activities.length} operational events`);

  console.log('\n🎉 =========================================================');
  console.log('🎉 ALL SMARTWASTE E2E SYSTEM VERIFICATION STEPS PASSED!');
  console.log('🎉 Full lifecycle loop is complete, robust, and verified.');
  console.log('🎉 =========================================================\n');
}

runE2ELifecycleTest().catch((err) => {
  console.error('💥 E2E Test execution failed:', err);
  process.exit(1);
});
