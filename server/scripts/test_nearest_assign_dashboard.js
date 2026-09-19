import db from '../src/db/index.js';

const BASE_URL = 'http://localhost:5000';

async function testDashboardComplaintFlow() {
  console.log('--- 1. Authenticating as Admin ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  if (!loginRes.ok) throw new Error('Login failed');
  const { token } = await loginRes.json();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('✓ Admin authenticated.');

  console.log('\n--- 2. Fetching Open Complaints ---');
  const compsRes = await fetch(`${BASE_URL}/api/complaints?status=open`, { headers });
  const complaints = await compsRes.json();
  console.log(`Found ${complaints.length} open complaints.`);

  if (complaints.length === 0) {
    console.log('Creating a test complaint for testing...');
    const newCompRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        citizen_id: 7,
        bin_id: 9,
        type: 'overflowing_bin',
        description: 'Trash is spilling onto the street outside shop.'
      })
    });
    const newComp = await newCompRes.json();
    complaints.push(newComp);
  }

  const targetComplaint = complaints[0];
  console.log(`Targeting complaint #${targetComplaint.id} (Bin ${targetComplaint.bin_code || targetComplaint.bin_id})`);

  console.log('\n--- 3. Testing POST /api/complaints/:id/assign-nearest ---');
  // Ensure at least one driver is available
  db.prepare("UPDATE drivers SET availability = 'available' WHERE id IN (1, 2, 3)").run();

  const assignRes = await fetch(`${BASE_URL}/api/complaints/${targetComplaint.id}/assign-nearest`, {
    method: 'POST',
    headers
  });
  if (!assignRes.ok) {
    throw new Error(`Assign nearest failed: ${assignRes.status} ${await assignRes.text()}`);
  }
  const assignData = await assignRes.json();
  console.log('Assignment response:', assignData.message);
  console.log('Assigned driver:', assignData.driver.name, `(${assignData.driver.distanceKm} km)`);
  console.log('Updated complaint status:', assignData.complaint.status);
  console.log('Resolution note on complaint:', assignData.complaint.resolution_note);

  if (assignData.complaint.status !== 'assigned') {
    throw new Error(`Expected complaint status to be 'assigned', got '${assignData.complaint.status}'`);
  }
  if (!assignData.complaint.assigned_driver_id) {
    throw new Error('Expected assigned_driver_id to be set on complaint');
  }
  console.log('✓ Nearest driver assigned to complaint verified.');

  console.log('\n--- 4. Testing POST /api/requests/assign-nearest on a Critical Bin ---');
  const criticalBin = db.prepare('SELECT id, bin_code FROM bins WHERE current_fill_percent >= 80 LIMIT 1').get();
  console.log(`Targeting critical bin ${criticalBin.bin_code} (ID: ${criticalBin.id})`);

  // Ensure driver 2 is available
  db.prepare("UPDATE drivers SET availability = 'available' WHERE id = 2").run();

  const binAssignRes = await fetch(`${BASE_URL}/api/requests/assign-nearest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ bin_id: criticalBin.id })
  });
  if (!binAssignRes.ok) {
    throw new Error(`Bin assign nearest failed: ${binAssignRes.status} ${await binAssignRes.text()}`);
  }
  const binAssignData = await binAssignRes.json();
  console.log('Bin assignment response:', binAssignData.message);
  console.log('Assigned driver:', binAssignData.driver.name);
  console.log('✓ Nearest driver assigned to critical bin verified.');

  // Clean up: Reset complaint and drivers
  db.prepare(`UPDATE complaints SET status = 'open', assigned_driver_id = NULL, resolution_note = NULL WHERE id = ?`).run(targetComplaint.id);
  db.prepare("UPDATE drivers SET availability = 'available'").run();

  console.log('\n========================================');
  console.log('ALL NEAREST DRIVER DISPATCH TESTS PASSED!');
  console.log('========================================');
}

testDashboardComplaintFlow().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
