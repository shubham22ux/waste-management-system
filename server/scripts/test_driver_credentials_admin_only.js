const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- STARTING DRIVER CREDENTIALS & ADMIN-ONLY CREATION TESTS ---');

  // Step 1: Test self-registration block for driver role
  console.log('\n[1] Testing driver self-registration block on POST /api/auth/register...');
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rogue Driver',
      email: 'roguedriver@test.com',
      password: 'password123',
      role: 'driver'
    })
  });

  if (regRes.status === 403) {
    const data = await regRes.json();
    console.log('SUCCESS: Driver self-registration was blocked with 403:', data.error);
  } else {
    console.error('FAILED: Driver self-registration should have been rejected with 403, got:', regRes.status);
    process.exit(1);
  }

  // Step 2: Test unauthenticated driver creation
  console.log('\n[2] Testing unauthenticated driver creation on POST /api/drivers...');
  const unauthRes = await fetch(`${BASE_URL}/drivers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Unauthorized Attempt',
      email: 'unauth@test.com',
      password: 'password123',
      license_number: 'KA-99-TEST'
    })
  });

  if (unauthRes.status === 401 || unauthRes.status === 403) {
    console.log('SUCCESS: Unauthenticated attempt blocked with status:', unauthRes.status);
  } else {
    console.error('FAILED: Unauthenticated POST /api/drivers should be blocked, got:', unauthRes.status);
    process.exit(1);
  }

  // Step 3: Admin login to get admin JWT
  console.log('\n[3] Logging in as Admin (admin@smartwaste.gov)...');
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

  // Step 4: Admin creates a new driver with admin-generated username and password
  const uniqueSuffix = Date.now().toString().slice(-4);
  const testDriverUsername = `driver.test${uniqueSuffix}@smartwaste.gov`;
  const testDriverPassword = `Driver#X9${uniqueSuffix}`;
  const testLicense = `KA-01-DL-${uniqueSuffix}`;

  console.log(`\n[4] Admin generating driver: ${testDriverUsername} / ${testDriverPassword}...`);
  const createDriverRes = await fetch(`${BASE_URL}/drivers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: `Test Driver ${uniqueSuffix}`,
      email: testDriverUsername,
      password: testDriverPassword,
      phone: `+91 98000 ${uniqueSuffix}`,
      license_number: testLicense
    })
  });

  if (!createDriverRes.ok) {
    const errData = await createDriverRes.json();
    console.error('FAILED: Admin creating driver failed:', createDriverRes.status, errData);
    process.exit(1);
  }

  const createdData = await createDriverRes.json();
  console.log('SUCCESS: Driver created via Admin endpoint! Driver ID:', createdData.driver.id);
  console.log('Initial GPS Coordinates:', createdData.driver.currentLatitude, createdData.driver.currentLongitude);
  const newDriverId = createdData.driver.id;

  // Step 5: New driver logs in with the admin-issued credentials
  console.log('\n[5] Testing driver login using admin-issued credentials...');
  const driverLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testDriverUsername,
      password: testDriverPassword
    })
  });

  if (!driverLoginRes.ok) {
    console.error('FAILED: Driver login with admin-issued credentials failed:', driverLoginRes.status);
    process.exit(1);
  }

  const driverData = await driverLoginRes.json();
  console.log('SUCCESS: Driver logged in! User:', driverData.user.name, 'Role:', driverData.user.role);
  if (driverData.user.role !== 'driver') {
    console.error('FAILED: Logged in user role is not driver:', driverData.user.role);
    process.exit(1);
  }

  // Step 6: Admin resets driver password
  console.log('\n[6] Admin resets driver password via POST /api/drivers/:id/reset-password...');
  const newPassword = `Driver#Reset${uniqueSuffix}`;
  const resetRes = await fetch(`${BASE_URL}/drivers/${newDriverId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ newPassword })
  });

  if (!resetRes.ok) {
    console.error('FAILED: Admin reset password failed:', resetRes.status);
    process.exit(1);
  }
  const resetData = await resetRes.json();
  console.log('SUCCESS: Password reset by admin! Message:', resetData.message);

  // Step 7: Driver logs in with new password
  console.log('\n[7] Testing driver login with updated reset password...');
  const driverLoginRes2 = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testDriverUsername,
      password: newPassword
    })
  });

  if (!driverLoginRes2.ok) {
    console.error('FAILED: Driver login with reset password failed:', driverLoginRes2.status);
    process.exit(1);
  }
  const driverData2 = await driverLoginRes2.json();
  console.log('SUCCESS: Driver logged in with new password! User:', driverData2.user.name);

  console.log('\n======================================================');
  console.log('ALL DRIVER CREDENTIAL & ADMIN-ONLY TESTS PASSED 100%!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
