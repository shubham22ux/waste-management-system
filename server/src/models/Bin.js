import mongoose from 'mongoose';

const binSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  bin_code: { type: String, required: true, unique: true },
  location_name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  capacity_liters: { type: Number, default: 1000 },
  current_fill_percent: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'damaged', 'inactive'], default: 'active' },
  last_emptied_at: { type: Date, default: null },
  fill_rate_per_hour: { type: Number, default: 4.5 },
  estimated_hours_until_full: { type: Number, default: null },
  fill_prediction_status: { type: String, default: 'normal' },
  updated_at: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const Bin = mongoose.models.Bin || mongoose.model('Bin', binSchema);
export default Bin;
