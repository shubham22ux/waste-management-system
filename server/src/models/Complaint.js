import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  citizen_id: { type: Number, required: true },
  bin_id: { type: Number, default: null },
  type: {
    type: String,
    enum: ['overflowing_bin', 'damaged_bin', 'missed_collection', 'illegal_dumping', 'other'],
    required: true
  },
  description: { type: String, required: true },
  photo_url: { type: String, default: null },
  status: { type: String, enum: ['open', 'assigned', 'collected', 'resolved', 'in_progress'], default: 'open' },
  assigned_driver_id: { type: Number, default: null },
  assignedDriverId: { type: Number, default: null },
  resolution_note: { type: String, default: null },
  resolutionNote: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  resolved_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);
export default Complaint;
