import { connectMongoDB, isMongoConnected, disconnectMongoDB } from '../src/db/mongo.js';
import {
  User,
  Bin,
  Vehicle,
  Driver,
  CollectionRequest,
  Route,
  FuelLog,
  Complaint,
  Notification
} from '../src/models/index.js';
import db from '../src/db/index.js';
import {
  saveComplaintToMongo,
  saveBinToMongo,
  saveFuelLogToMongo,
  deleteFromMongo
} from '../src/services/mongoSync.js';

async function runTests() {
  console.log('--- Starting MongoDB Integration & Live Persistence Tests ---');

  // 1. Connection check
  await connectMongoDB();
  if (!isMongoConnected()) {
    throw new Error('Failed to connect to MongoDB');
  }
  console.log('✓ MongoDB Connection: Connected to mongodb://127.0.0.1:27017/smartwaste');

  // 2. Collections count verification
  const [users, bins, vehicles, drivers, requests, routes, fuelLogs, complaints, notifs] = await Promise.all([
    User.countDocuments(),
    Bin.countDocuments(),
    Vehicle.countDocuments(),
    Driver.countDocuments(),
    CollectionRequest.countDocuments(),
    Route.countDocuments(),
    FuelLog.countDocuments(),
    Complaint.countDocuments(),
    Notification.countDocuments()
  ]);

  console.log('✓ Collection Counts in MongoDB:');
  console.log(`  Users: ${users}, Bins: ${bins}, Vehicles: ${vehicles}`);
  console.log(`  Drivers: ${drivers}, Requests: ${requests}, Routes: ${routes}`);
  console.log(`  Fuel Logs: ${fuelLogs}, Complaints: ${complaints}, Notifications: ${notifs}`);

  if (users < 1 || bins < 1 || routes < 1) {
    throw new Error('Expected collections to have synchronized records, but found empty or missing collections.');
  }

  // 3. Test Live Persistence: Create test complaint
  const testId = 999999;
  const testComplaint = {
    id: testId,
    citizen_id: 3,
    bin_id: 1,
    type: 'overflowing_bin',
    description: 'MongoDB persistence verification test report',
    photo_url: null,
    status: 'open',
    resolution_note: null,
    created_at: new Date().toISOString()
  };

  await saveComplaintToMongo(testComplaint);
  const foundComplaint = await Complaint.findOne({ id: testId });
  if (!foundComplaint || foundComplaint.description !== testComplaint.description) {
    throw new Error('Complaint live persistence failed: document not found in MongoDB');
  }
  console.log('✓ Live Insert Persistence: Complaint saved and verified in MongoDB');

  // 4. Test Live Update: Update status
  testComplaint.status = 'resolved';
  testComplaint.resolution_note = 'Resolved during automated test';
  await saveComplaintToMongo(testComplaint);
  const updatedComplaint = await Complaint.findOne({ id: testId });
  if (!updatedComplaint || updatedComplaint.status !== 'resolved') {
    throw new Error('Complaint live update failed');
  }
  console.log('✓ Live Update Persistence: Complaint updated and verified in MongoDB');

  // 5. Test Live Deletion
  await deleteFromMongo('Complaint', testId);
  const deletedComplaint = await Complaint.findOne({ id: testId });
  if (deletedComplaint) {
    throw new Error('Complaint live delete failed: document still exists');
  }
  console.log('✓ Live Delete Persistence: Complaint deleted and confirmed removed from MongoDB');

  // 6. Test Live FuelLog persistence
  const testFuelLog = {
    id: testId,
    vehicle_id: 1,
    route_id: null,
    liters_filled: 25.5,
    cost: 2410,
    odometer_km: 12050,
    log_date: '2026-09-11'
  };
  await saveFuelLogToMongo(testFuelLog);
  const foundFuel = await FuelLog.findOne({ id: testId });
  if (!foundFuel || foundFuel.liters_filled !== 25.5) {
    throw new Error('FuelLog live persistence failed');
  }
  await deleteFromMongo('FuelLog', testId);
  console.log('✓ Live FuelLog Persistence & Deletion: Verified in MongoDB');

  // 7. Verify Embedded Route Stops
  const sampleRoute = await Route.findOne({ 'stops.0': { $exists: true } });
  if (!sampleRoute) {
    throw new Error('No Route with embedded stops found in MongoDB');
  }
  console.log(`✓ Embedded Subdocuments: Sample Route #${sampleRoute.id} has ${sampleRoute.stops.length} embedded stops in MongoDB`);

  console.log('\n🎉 ALL MONGODB VERIFICATION TESTS PASSED SUCCESSFULLY!');
  await disconnectMongoDB();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ MongoDB Test Failed:', err);
  process.exit(1);
});
