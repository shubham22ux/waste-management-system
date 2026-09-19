import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  user_id: { type: Number, required: true, unique: true },
  license_number: { type: String, required: true, unique: true },
  assigned_vehicle_id: { type: Number, default: null },
  availability: { type: String, enum: ['available', 'busy', 'off_duty'], default: 'available' },
  currentLatitude: { type: Number, default: null },
  currentLongitude: { type: Number, default: null },
  locationUpdatedAt: { type: Date, default: null }
}, {
  timestamps: true
});

export const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
export default Driver;
