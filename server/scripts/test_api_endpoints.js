async function run() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in as admin, token received:', !!token);

  // 1. Test GET /api/drivers/nearest?binId=1
  const nearestRes = await fetch('http://localhost:5000/api/drivers/nearest?binId=1', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('nearestRes status:', nearestRes.status);
  const drivers = await nearestRes.json();
  console.log('drivers payload:', drivers);

  // 2. Test POST /api/requests/1/assign with top driver
  const assignRes = await fetch('http://localhost:5000/api/requests/1/assign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ driver_id: drivers[0].id })
  });
  const assignResult = await assignRes.json();
  console.log('\nAssign response:', assignResult.message);
  console.log('Request status:', assignResult.request?.status, 'assigned to driver:', assignResult.request?.driver_name);
  console.log('Driver availability now:', assignResult.driver?.availability);
}

run().catch(console.error);
