const API_BASE = 'http://localhost:5000/api';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function verifyEnhancements() {
  console.log('🚀 Starting SmartWaste 5-Feature Enhancements Verification...\n');

  // 1. Verify Predictive Fill Estimation on /api/bins
  console.log('--- Enhancement 1: Predictive Fill Estimation ---');
  const binsRes = await fetch(`${API_BASE}/bins`);
  assert(binsRes.ok, `GET /api/bins returned status ${binsRes.status}`);
  const bins = await binsRes.json();
  assert(bins.length > 0, `Fetched ${bins.length} bins`);

  const activeBins = bins.filter((b) => b.status === 'active');
  assert(activeBins.length > 0, 'Active bins found in inventory');
  const testBin = activeBins[0];
  console.log(`   Sample Active Bin: ${testBin.bin_code} at ${testBin.location_name}`);
  console.log(`   Current Fill: ${testBin.current_fill_percent}%`);
  console.log(`   Hourly Fill Rate: ${testBin.fill_rate_per_hour}% / hr`);
  console.log(`   Estimated Hours Until Full: ${testBin.estimated_hours_until_full} hrs`);
  console.log(`   Prediction Status: ${testBin.fill_prediction_status}`);

  assert(testBin.fill_rate_per_hour > 0, 'fill_rate_per_hour is populated and positive');
  assert(testBin.estimated_hours_until_full !== undefined, 'estimated_hours_until_full is defined');
  assert(typeof testBin.fill_prediction_status === 'string', 'fill_prediction_status is a valid string');

  // 2. Verify PDF Report Aggregation Endpoint
  console.log('\n--- Enhancement 2: Monthly PDF Summary Report Data Source ---');
  const reportRes = await fetch(`${API_BASE}/reports/monthly-summary`);
  assert(reportRes.ok, `GET /api/reports/monthly-summary returned status ${reportRes.status}`);
  const reportData = await reportRes.json();

  console.log(`   Report Title: ${reportData.report_title}`);
  console.log(`   Period: ${reportData.month}`);
  console.log(`   Collections Completed: ${reportData.kpis?.collections_completed}`);
  console.log(`   Total Fuel Cost: Rs. ${reportData.kpis?.total_fuel_cost}`);
  console.log(`   Complaints Resolved: ${reportData.kpis?.complaints_resolved} / ${reportData.kpis?.complaints_total} (${reportData.kpis?.resolution_rate_percent}%)`);

  assert(reportData.kpis?.collections_completed >= 0, 'Collections completed count present');
  assert(reportData.kpis?.total_fuel_cost >= 0, 'Total fuel cost present');
  assert(reportData.kpis?.complaints_resolved >= 0, 'Complaints resolved present');
  assert(Array.isArray(reportData.completed_routes), 'Completed routes list is an array');
  assert(Array.isArray(reportData.vehicle_fuel_summary), 'Vehicle fuel summary is an array');
  assert(Array.isArray(reportData.complaints_by_category), 'Complaints by category is an array');

  // 3. Verify Operations Analytics Endpoint
  console.log('\n--- Enhancement 3: Operations Analytics Endpoint ---');
  const analyticsRes = await fetch(`${API_BASE}/analytics/operations`);
  assert(analyticsRes.ok, `GET /api/analytics/operations returned status ${analyticsRes.status}`);
  const analyticsData = await analyticsRes.json();

  console.log(`   Avg Request-to-Completion: ${analyticsData.summary?.avg_request_completion_hours} hrs`);
  console.log(`   Avg Complaint Resolution: ${analyticsData.summary?.avg_complaint_resolution_hours} hrs`);
  console.log(`   SLA Compliance: ${analyticsData.summary?.sla_compliance_percent}%`);
  console.log(`   Daily Trend Points: ${analyticsData.collections_trend?.length} days`);

  assert(analyticsData.summary?.avg_request_completion_hours > 0, 'Average request completion hours present');
  assert(analyticsData.summary?.avg_complaint_resolution_hours > 0, 'Average complaint resolution hours present');
  assert(Array.isArray(analyticsData.collections_trend), 'Collections trend is an array');
  assert(analyticsData.collections_trend.length >= 7, 'Collections trend contains at least 7 days');
  assert(Array.isArray(analyticsData.sla_benchmarks), 'SLA benchmarks list is an array');

  console.log('\n🎉 =========================================================');
  console.log('🎉 ALL SMARTWASTE ENHANCEMENT CHECKS PASSED SUCCESSFULLY!');
  console.log('🎉 =========================================================\n');
}

verifyEnhancements().catch((err) => {
  console.error('💥 Enhancement verification failed:', err);
  process.exit(1);
});
