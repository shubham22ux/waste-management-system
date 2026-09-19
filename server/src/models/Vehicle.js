import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  plate_number: { type: String, required: true, unique: true },
  model: { type: String, required: true },
  fuel_type: { type: String, default: 'Diesel' },
  tank_capacity: { type: Number, default: 150.0 },
  avg_mileage_kmpl: { type: Number, required: true },
  status: { type: String, enum: ['available', 'on_route', 'maintenance'], default: 'available' }
}, {
  timestamps: true
});

export const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
