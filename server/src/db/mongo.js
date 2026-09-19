import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartwaste';

let isConnected = false;

export async function connectMongoDB() {
  if (isConnected) return mongoose.connection;

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    isConnected = true;
    console.log(`[MongoDB] Connected successfully to ${MONGODB_URI}`);

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB Error]', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected from database.');
      isConnected = false;
    });

    return mongoose.connection;
  } catch (err) {
    console.error(`[MongoDB] Failed to connect to ${MONGODB_URI}:`, err.message);
    isConnected = false;
    return null;
  }
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectMongoDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export default mongoose;
