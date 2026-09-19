import mongoose from 'mongoose';

const routeStopSubSchema = new mongoose.Schema({
  id: { type: Number },
  stop_id: { type: Number },
  bin_id: { type: Number, required: true },
  bin_code: { type: String },
  location_name: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  current_fill_percent: { type: Number },
  stop_order: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'collected', 'skipped'], default: 'pending' },
  skip_reason: { type: String, default: null },
  collected_at: { type: Date, default: null }
}, { _id: false });

const routeSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  driver_id: { type: Number, default: null },
  vehicle_id: { type: Number, default: null },
  status: { type: String, enum: ['planned', 'in_progress', 'completed'], default: 'planned' },
  total_distance_km: { type: Number, default: 0 },
  stops: [routeStopSubSchema],
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const Route = mongoose.models.Route || mongoose.model('Route', routeSchema);
export default Route;
