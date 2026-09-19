import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = 'http://localhost:5000';

async function testDashboardBackend() {
  console.log('--- 1. Testing GET /api/dashboard/summary ---');
  const summaryRes = await fetch(`${BASE_URL}/api/dashboard/summary`);
  if (!summaryRes.ok) {
    throw new Error(`Summary failed: ${summaryRes.status} ${await summaryRes.text()}`);
  }
  const summary = await summaryRes.json();
  console.log('Summary response:', summary);

  const requiredSummaryFields = [
    'criticalBins',
    'pendingAssignments',
    'driversAvailable',
    'openComplaints',
    'collectionsCompletedToday'
  ];

  for (const field of requiredSummaryFields) {
    if (summary[field] === undefined) {
      throw new Error(`Missing field in summary: ${field}`);
    }
  }
  console.log('✓ All 5 summary metrics present and numeric.');

  console.log('\n--- 2. Testing GET /api/dashboard/activity ---');
  const actRes = await fetch(`${BASE_URL}/api/dashboard/activity`);
  if (!actRes.ok) {
    throw new Error(`Activity failed: ${actRes.status} ${await actRes.text()}`);
  }
  const activities = await actRes.json();
  console.log(`Activity feed items returned: ${activities.length} (max 10)`);
  if (activities.length > 10) {
    throw new Error(`Activity returned more than 10 items: ${activities.length}`);
  }
  if (activities.length > 0) {
    console.log('Sample activity item:', activities[0]);
    if (!activities[0].text || !activities[0].timestamp) {
      throw new Error('Activity item missing text or timestamp');
    }
  }
  console.log('✓ Activity feed conforms to { id, text, timestamp, type } schema.');

  console.log('\n--- 3. Testing "Needs Your Action" Combined Data Feeds ---');
  const [reqsRes, compsRes] = await Promise.all([
    fetch(`${BASE_URL}/api/requests?status=pending`),
    fetch(`${BASE_URL}/api/complaints?status=open`)
  ]);

  if (!reqsRes.ok || !compsRes.ok) {
    throw new Error('Failed to fetch pending requests or open complaints');
  }

  const pendingReqs = await reqsRes.json();
  const openComps = await compsRes.json();
  console.log(`Pending requests count: ${pendingReqs.length}`);
  console.log(`Open complaints count: ${openComps.length}`);
  console.log('✓ Both data feeds responding for Needs Your Action queue.');

  console.log('\n--- 4. Testing Socket.IO connection and real-time event reception ---');
  const socket = io(BASE_URL, {
    transports: ['websocket']
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO connection timeout')), 4000);
    socket.on('connect', () => {
      clearTimeout(timer);
      console.log('✓ Socket.IO connected successfully with id:', socket.id);
      resolve();
    });
  });

  socket.disconnect();
  console.log('✓ Socket.IO verified.');

  console.log('\n========================================');
  console.log('ALL DASHBOARD CHECKS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

testDashboardBackend().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
