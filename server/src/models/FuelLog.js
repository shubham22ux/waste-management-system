import mongoose from 'mongoose';

const fuelLogSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  vehicle_id: { type: Number, required: true },
  route_id: { type: Number, default: null },
  liters_filled: { type: Number, required: true },
  cost: { type: Number, required: true },
  odometer_km: { type: Number, required: true },
  log_date: { type: String, required: true },
  notes: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const FuelLog = mongoose.models.FuelLog || mongoose.model('FuelLog', fuelLogSchema);
export default FuelLog;
