const BASE_URL = 'http://localhost:5000/api';

async function runVehicleUnassignTest() {
  console.log('--- STARTING VEHICLE CRUD & DRIVER UNASSIGNMENT/REASSIGNMENT TESTS ---');

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

  // Step 2: Create Vehicle 1
  const uniqueSuffix = Date.now().toString().slice(-4);
  const plate1 = `KA-01-VT1-${uniqueSuffix}`;
  console.log(`\n[2] Admin creates Vehicle 1 with plate ${plate1}...`);
  const createV1Res = await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      plate_number: plate1,
      model: 'Tata 407 LPT Special',
      fuel_type: 'Diesel',
      tank_capacity: 150,
      avg_mileage_kmpl: 6.5,
      status: 'available'
    })
  });

  if (!createV1Res.ok) {
    const err = await createV1Res.json();
    console.error('FAILED: Create Vehicle 1 failed:', err);
    process.exit(1);
  }
  const vehicle1 = await createV1Res.json();
  console.log(`SUCCESS: Vehicle 1 created! ID: ${vehicle1.id}, Plate: ${vehicle1.plate_number}`);

  // Step 3: Fetch an existing driver (Driver X)
  console.log('\n[3] Fetching drivers to pick Driver X...');
  const driversRes = await fetch(`${BASE_URL}/drivers`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const drivers = await driversRes.json();
  if (!drivers || drivers.length === 0) {
    console.error('FAILED: No drivers available in database');
    process.exit(1);
  }
  const driverX = drivers[0];
  console.log(`Picked Driver X: ${driverX.name} (ID: ${driverX.id}, Previous Vehicle: ${driverX.vehicle_plate || 'None'})`);

  // Step 4: Admin assigns Driver X to Vehicle 1
  console.log(`\n[4] Assigning Driver X (${driverX.name}) to Vehicle 1 (${vehicle1.plate_number})...`);
  const assignV1Res = await fetch(`${BASE_URL}/drivers/${driverX.id}/assign-vehicle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ vehicle_id: vehicle1.id })
  });

  if (!assignV1Res.ok) {
    const err = await assignV1Res.json();
    console.error('FAILED: Assigning Driver X to Vehicle 1 failed:', err);
    process.exit(1);
  }
  const assignV1Data = await assignV1Res.json();
  console.log('SUCCESS: Driver X assigned to Vehicle 1! Message:', assignV1Data.message);

  // Step 5: Verify Driver X has Vehicle 1 assigned
  console.log('\n[5] Verifying Driver X assigned_vehicle_id and plate...');
  const verifyDriverRes = await fetch(`${BASE_URL}/drivers/${driverX.id}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const verifiedDriver = await verifyDriverRes.json();
  console.log(`Driver X current vehicle: ID=${verifiedDriver.assigned_vehicle_id}, Plate=${verifiedDriver.vehicle_plate}`);
  if (verifiedDriver.assigned_vehicle_id !== vehicle1.id) {
    console.error(`FAILED: Expected assigned_vehicle_id=${vehicle1.id}, got: ${verifiedDriver.assigned_vehicle_id}`);
    process.exit(1);
  }

  // Also verify vehicle endpoint shows driver
  const verifyV1Res = await fetch(`${BASE_URL}/vehicles/${vehicle1.id}`);
  const verifiedV1 = await verifyV1Res.json();
  console.log(`Vehicle 1 assigned driver: ID=${verifiedV1.driver_id}, Name=${verifiedV1.driver_name}`);
  if (verifiedV1.driver_id !== driverX.id) {
    console.error(`FAILED: Expected vehicle1.driver_id=${driverX.id}, got: ${verifiedV1.driver_id}`);
    process.exit(1);
  }

  // Step 6: Admin deletes Vehicle 1
  console.log(`\n[6] Admin deletes Vehicle 1 (ID: ${vehicle1.id}, Plate: ${vehicle1.plate_number})...`);
  const deleteV1Res = await fetch(`${BASE_URL}/vehicles/${vehicle1.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  if (!deleteV1Res.ok) {
    const err = await deleteV1Res.json();
    console.error('FAILED: Deleting Vehicle 1 failed:', err);
    process.exit(1);
  }
  const deleteV1Data = await deleteV1Res.json();
  console.log('SUCCESS: Vehicle 1 deleted! Response:', deleteV1Data);
  console.log('Unassigned drivers list:', deleteV1Data.unassignedDrivers);

  // Step 7: Verify Vehicle 1 is deleted
  console.log('\n[7] Verifying Vehicle 1 no longer exists in GET /api/vehicles/:id...');
  const checkV1Res = await fetch(`${BASE_URL}/vehicles/${vehicle1.id}`);
  if (checkV1Res.status === 404) {
    console.log('SUCCESS: Vehicle 1 is confirmed deleted (404 Not Found)');
  } else {
    console.error('FAILED: Vehicle 1 still returned non-404 status:', checkV1Res.status);
    process.exit(1);
  }

  // Step 8: Verify Driver X is now UNASSIGNED
  console.log('\n[8] Verifying Driver X is now UNASSIGNED (assigned_vehicle_id === null)...');
  const verifyUnassignedRes = await fetch(`${BASE_URL}/drivers/${driverX.id}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const unassignedDriver = await verifyUnassignedRes.json();
  console.log(`Driver X after vehicle deletion: assigned_vehicle_id=${unassignedDriver.assigned_vehicle_id}, vehicle_plate=${unassignedDriver.vehicle_plate}`);
  if (unassignedDriver.assigned_vehicle_id !== null && unassignedDriver.assigned_vehicle_id !== undefined) {
    console.error('FAILED: Driver X was NOT unassigned! assigned_vehicle_id is:', unassignedDriver.assigned_vehicle_id);
    process.exit(1);
  }
  console.log('SUCCESS: Driver X is confirmed unassigned!');

  // Step 9: Admin creates Vehicle 2
  const plate2 = `KA-01-VT2-${uniqueSuffix}`;
  console.log(`\n[9] Admin creates Vehicle 2 with plate ${plate2}...`);
  const createV2Res = await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      plate_number: plate2,
      model: 'Ashok Leyland Dost+',
      fuel_type: 'Diesel',
      tank_capacity: 90,
      avg_mileage_kmpl: 7.5,
      status: 'available'
    })
  });

  const vehicle2 = await createV2Res.json();
  console.log(`SUCCESS: Vehicle 2 created! ID: ${vehicle2.id}, Plate: ${vehicle2.plate_number}`);

  // Step 10: Admin assigns Driver X to Vehicle 2
  console.log(`\n[10] Admin assigns unassigned Driver X (${driverX.name}) to Vehicle 2 (${vehicle2.plate_number})...`);
  const assignV2Res = await fetch(`${BASE_URL}/drivers/${driverX.id}/assign-vehicle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ vehicle_id: vehicle2.id })
  });

  if (!assignV2Res.ok) {
    const err = await assignV2Res.json();
    console.error('FAILED: Assigning Driver X to Vehicle 2 failed:', err);
    process.exit(1);
  }
  const assignV2Data = await assignV2Res.json();
  console.log('SUCCESS: Driver X reassigned to Vehicle 2! Message:', assignV2Data.message);

  // Step 11: Verify Driver X is now assigned to Vehicle 2
  console.log('\n[11] Verifying Driver X is now assigned to Vehicle 2...');
  const verifyReassignedRes = await fetch(`${BASE_URL}/drivers/${driverX.id}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const reassignedDriver = await verifyReassignedRes.json();
  console.log(`Driver X vehicle: ID=${reassignedDriver.assigned_vehicle_id}, Plate=${reassignedDriver.vehicle_plate}`);
  if (reassignedDriver.assigned_vehicle_id !== vehicle2.id) {
    console.error(`FAILED: Expected assigned_vehicle_id=${vehicle2.id}, got: ${reassignedDriver.assigned_vehicle_id}`);
    process.exit(1);
  }
  console.log('SUCCESS: Driver X successfully reassigned to Vehicle 2!');

  console.log('\n========================================================================');
  console.log('ALL VEHICLE CRUD, DRIVER UNASSIGNMENT & REASSIGNMENT TESTS PASSED 100%!');
  console.log('========================================================================');
}

runVehicleUnassignTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
