import mongoose from 'mongoose';

const collectionRequestSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  bin_id: { type: Number, required: true },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['pending', 'assigned', 'in_progress', 'completed', 'skipped'], default: 'pending' },
  assigned_driver_id: { type: Number, default: null },
  assigned_at: { type: Date, default: null },
  source: { type: String, enum: ['sensor', 'complaint', 'manual'], default: 'manual' },
  complaint_id: { type: Number, default: null },
  skip_reason: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const CollectionRequest = mongoose.models.CollectionRequest || mongoose.model('CollectionRequest', collectionRequestSchema);
export default CollectionRequest;
