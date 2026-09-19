import db from '../src/db/index.js';
import { connectMongoDB } from '../src/db/mongo.js';
import { syncAllToMongo } from '../src/services/mongoSync.js';
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
import mongoose from 'mongoose';

async function main() {
  console.log('🌱 ====================================================');
  console.log('🌱 SMARTWASTE MONGODB DATA SYNCHRONIZATION CLI');
  console.log('🌱 ====================================================\n');

  console.log('Connecting to MongoDB...');
  const conn = await connectMongoDB();
  if (!conn) {
    console.error('❌ Could not connect to MongoDB. Is MongoDB running on localhost:27017?');
    process.exit(1);
  }

  console.log('Running full SQLite to MongoDB sync...\n');
  const result = await syncAllToMongo(db);

  if (result) {
    console.log('\n--- Verifying MongoDB Collection Document Counts ---');
    const [
      userCount,
      binCount,
      vehicleCount,
      driverCount,
      requestCount,
      routeCount,
      fuelCount,
      complaintCount,
      notifCount
    ] = await Promise.all([
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

    console.log(`✅ Users:                ${userCount} documents in MongoDB 'users'`);
    console.log(`✅ Bins:                 ${binCount} documents in MongoDB 'bins'`);
    console.log(`✅ Vehicles:             ${vehicleCount} documents in MongoDB 'vehicles'`);
    console.log(`✅ Drivers:              ${driverCount} documents in MongoDB 'drivers'`);
    console.log(`✅ Collection Requests:  ${requestCount} documents in MongoDB 'collectionrequests'`);
    console.log(`✅ Routes:               ${routeCount} documents in MongoDB 'routes'`);
    console.log(`✅ Fuel Logs:            ${fuelCount} documents in MongoDB 'fuellogs'`);
    console.log(`✅ Complaints:           ${complaintCount} documents in MongoDB 'complaints'`);
    console.log(`✅ Notifications:        ${notifCount} documents in MongoDB 'notifications'`);

    console.log('\n🎉 ALL SMARTWASTE DATA SUCCESSFULLY SAVED TO MONGODB!');
    console.log('🎉 You can inspect the database in mongosh or MongoDB Compass at: mongodb://localhost:27017/smartwaste');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
