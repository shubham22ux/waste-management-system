import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import {
  saveComplaintToMongo,
  saveRequestToMongo,
  saveBinToMongo,
  deleteFromMongo
} from '../services/mongoSync.js';
import { uploadFile, deleteFile } from '../services/storageService.js';
import { detectWasteLabels } from '../services/rekognitionService.js';
import { haversineDistanceKm } from '../utils/distance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer with memory storage so buffer can be streamed to S3 or saved locally
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

const router = express.Router();

const getIo = (req) => req.app.get('io');

const complaintSelectQuery = `
  SELECT 
    c.id,
    c.citizen_id,
    u.name AS citizen_name,
    u.email AS citizen_email,
    u.phone AS citizen_phone,
    c.bin_id,
    b.bin_code,
    b.location_name AS bin_location,
    b.latitude,
    b.longitude,
    b.current_fill_percent,
    b.status AS bin_status,
    c.type,
    c.description,
    c.photo_url,
    c.status,
    c.assigned_driver_id,
    du.name AS assigned_driver_name,
    du.phone AS assigned_driver_phone,
    v.plate_number AS assigned_vehicle_plate,
    c.resolution_note,
    c.created_at,
    c.resolved_at
  FROM complaints c
  JOIN users u ON c.citizen_id = u.id
  LEFT JOIN bins b ON c.bin_id = b.id
  LEFT JOIN drivers d ON c.assigned_driver_id = d.id
  LEFT JOIN users du ON d.user_id = du.id
  LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
`;

// POST /api/complaints/upload - Upload complaint photo to AWS S3 (or local disk fallback)
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // 1. Upload to AWS S3 (falls back to local filesystem if S3 is unconfigured)
    const uploadResult = await uploadFile({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      folder: 'complaints'
    });

    // 2. Optional AI verification with Amazon Rekognition
    const aiAnalysis = await detectWasteLabels(req.file.buffer);

    res.json({
      photoUrl: uploadResult.url,
      provider: uploadResult.provider,
      aiAnalysis
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints - List complaints with filters
router.get('/', (req, res) => {
  try {
    const { status, type, citizen_id, date } = req.query;
    let sql = complaintSelectQuery + ' WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      sql += ' AND c.type = ?';
      params.push(type);
    }
    if (citizen_id) {
      sql += ' AND c.citizen_id = ?';
      params.push(Number(citizen_id));
    }
    if (date) {
      sql += " AND date(c.created_at) = date(?)";
      params.push(date);
    }

    sql += ' ORDER BY c.created_at DESC, c.id DESC';
    const complaints = db.prepare(sql).all(...params);
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/:id - Get single complaint
router.get('/:id', (req, res) => {
  try {
    const complaint = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints - File a new complaint
router.post('/', (req, res) => {
  try {
    const { citizen_id, bin_id, type, description, photo_url } = req.body;

    if (!citizen_id || !type || !description) {
      return res.status(400).json({ error: 'citizen_id, type, and description are required' });
    }

    const citizen = db.prepare('SELECT name FROM users WHERE id = ?').get(citizen_id);
    const bin = bin_id ? db.prepare('SELECT bin_code, location_name FROM bins WHERE id = ?').get(bin_id) : null;

    const stmt = db.prepare(`
      INSERT INTO complaints (citizen_id, bin_id, type, description, photo_url, status)
      VALUES (?, ?, ?, ?, ?, 'open')
    `);

    const info = stmt.run(
      Number(citizen_id),
      bin_id ? Number(bin_id) : null,
      type,
      description,
      photo_url || null
    );

    const newComplaint = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(info.lastInsertRowid);

    // Notify all system administrators
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
    const typeLabel = type.replace('_', ' ');
    const binInfo = bin ? ` at ${bin.bin_code} (${bin.location_name})` : '';
    const notifMsg = `Citizen ${citizen ? citizen.name : ''} reported: ${typeLabel}${binInfo}`;

    const adminNotifStmt = db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'New Complaint Filed', ?, 'warning')
    `);

    admins.forEach((adm) => {
      adminNotifStmt.run(adm.id, notifMsg);
    });

    const io = getIo(req);
    if (io) {
      io.emit('complaint:created', newComplaint);
      io.emit('notification:new');
    }

    saveComplaintToMongo(newComplaint);

    res.status(201).json(newComplaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/complaints/:id - Update complaint status and resolution note
router.put('/:id', (req, res) => {
  try {
    const complaintId = req.params.id;
    const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });

    const { status, resolution_note, description, type, bin_id } = req.body;

    let newResolvedAt = existing.resolved_at;
    if (status === 'resolved' && existing.status !== 'resolved') {
      newResolvedAt = new Date().toISOString();
    } else if (status && status !== 'resolved') {
      newResolvedAt = null;
    }

    const stmt = db.prepare(`
      UPDATE complaints
      SET status = ?,
          resolution_note = ?,
          description = ?,
          type = ?,
          bin_id = ?,
          resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(
      status !== undefined ? status : existing.status,
      resolution_note !== undefined ? resolution_note : existing.resolution_note,
      description !== undefined ? description : existing.description,
      type !== undefined ? type : existing.type,
      bin_id !== undefined ? (bin_id ? Number(bin_id) : null) : existing.bin_id,
      newResolvedAt,
      complaintId
    );

    const updated = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(complaintId);

    // Notify citizen if status changed or resolution note added
    if ((status && status !== existing.status) || (resolution_note && resolution_note !== existing.resolution_note)) {
      const statusTitle = status === 'resolved' ? 'Complaint Resolved' : 'Complaint Status Updated';
      const notifMsg = status === 'resolved'
        ? (updated.bin_code ? `Your complaint about Bin ${updated.bin_code} has been resolved.` : `Your complaint #${complaintId} has been resolved.`)
        : `Your complaint #${complaintId} (${existing.type.replace('_', ' ')}) is now marked as "${(status || existing.status).replace('_', ' ')}"${resolution_note ? ': ' + resolution_note : '.'}`;

      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, ?)
      `).run(existing.citizen_id, statusTitle, notifMsg, status === 'resolved' ? 'success' : 'info');
    }

    const io = getIo(req);
    if (io) {
      io.emit('complaint:updated', updated);
      io.emit('notification:new');
    }

    saveComplaintToMongo(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints/:id/resolve - Mark resolved with resolution note and notify citizen
router.post('/:id/resolve', (req, res) => {
  try {
    const complaintId = req.params.id;
    const { resolution_note } = req.body;
    const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });

    const bin = existing.bin_id ? db.prepare('SELECT bin_code FROM bins WHERE id = ?').get(existing.bin_id) : null;
    const note = resolution_note && resolution_note.trim() ? resolution_note.trim() : (existing.resolution_note || 'Issue inspected and resolved by municipal dispatch crew.');
    const resolvedAt = new Date().toISOString();

    db.prepare(`
      UPDATE complaints
      SET status = 'resolved',
          resolution_note = ?,
          resolved_at = ?
      WHERE id = ?
    `).run(note, resolvedAt, complaintId);

    const updated = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(complaintId);

    // Exact required message: "Your complaint about Bin B-014 has been resolved."
    const notifMsg = bin 
      ? `Your complaint about Bin ${bin.bin_code} has been resolved.` 
      : `Your complaint #${complaintId} has been resolved.`;

    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Complaint Resolved', ?, 'success')
    `).run(existing.citizen_id, notifMsg);

    const io = getIo(req);
    if (io) {
      io.emit('complaint:updated', updated);
      io.emit('notification:new');
    }

    saveComplaintToMongo(updated);

    res.json({
      message: notifMsg,
      complaint: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints/:id/create-request - Create or link pending collection request with source 'complaint'
router.post('/:id/create-request', (req, res) => {
  try {
    const complaintId = req.params.id;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (!complaint.bin_id) {
      return res.status(400).json({ error: 'Complaint is not linked to a specific bin' });
    }

    // Check if there is already a pending collection request for this complaint or bin
    let request = db.prepare(`
      SELECT * FROM collection_requests 
      WHERE (complaint_id = ? OR bin_id = ?) AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `).get(complaintId, complaint.bin_id);

    let requestId = request ? request.id : null;

    if (!requestId) {
      const insertReq = db.prepare(`
        INSERT INTO collection_requests (bin_id, priority, status, source, complaint_id)
        VALUES (?, 'urgent', 'pending', 'complaint', ?)
      `);
      const reqInfo = insertReq.run(complaint.bin_id, complaintId);
      requestId = reqInfo.lastInsertRowid;
    } else {
      db.prepare("UPDATE collection_requests SET source = 'complaint', complaint_id = ? WHERE id = ?").run(complaintId, requestId);
    }

    const createdRequest = db.prepare(`
      SELECT cr.*, b.bin_code, b.location_name, b.latitude, b.longitude, b.current_fill_percent 
      FROM collection_requests cr 
      JOIN bins b ON cr.bin_id = b.id 
      WHERE cr.id = ?
    `).get(requestId);

    const io = getIo(req);
    if (io) {
      io.emit('request:created', createdRequest);
      io.emit('requests:updated');
    }

    saveRequestToMongo(createdRequest);

    res.json({
      message: `Collection request #${requestId} prepared for complaint #${complaintId}`,
      collectionRequest: createdRequest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints/:id/assign-nearest - One-click assign nearest available driver to complaint
router.post('/:id/assign-nearest', (req, res) => {
  try {
    const complaintId = req.params.id;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    let targetBinId = (req.body && req.body.bin_id) || complaint.bin_id;
    if (!targetBinId) {
      const defaultBin = db.prepare('SELECT id FROM bins ORDER BY id ASC LIMIT 1').get();
      targetBinId = defaultBin ? defaultBin.id : 1;
      db.prepare('UPDATE complaints SET bin_id = ? WHERE id = ?').run(targetBinId, complaintId);
    }

    const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(targetBinId);
    if (!bin) return res.status(404).json({ error: 'Target bin not found' });

    // Available drivers
    const availableDrivers = db.prepare(`
      SELECT 
        d.id, u.name, u.phone, u.id AS user_id,
        d.availability, d.assigned_vehicle_id,
        v.plate_number AS vehicle_plate,
        d.currentLatitude, d.currentLongitude
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.availability = 'available'
    `).all();

    if (availableDrivers.length === 0) {
      return res.status(400).json({ error: 'No available drivers at this moment. All drivers are busy or off-duty.' });
    }

    let nearestDriver = null;
    let minDistance = Infinity;

    availableDrivers.forEach((d) => {
      let dist = Infinity;
      if (d.currentLatitude !== null && d.currentLongitude !== null && bin.latitude !== null && bin.longitude !== null) {
        dist = haversineDistanceKm(bin.latitude, bin.longitude, d.currentLatitude, d.currentLongitude);
      }
      if (dist < minDistance) {
        minDistance = dist;
        nearestDriver = { ...d, distanceKm: Math.round(dist * 10) / 10 };
      }
    });

    if (!nearestDriver) {
      nearestDriver = { ...availableDrivers[0], distanceKm: null };
    }

    // Find or create pending collection request
    let request = db.prepare(`
      SELECT * FROM collection_requests 
      WHERE (complaint_id = ? OR bin_id = ?) AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `).get(complaintId, targetBinId);

    let requestId = request ? request.id : null;

    if (!requestId) {
      const insertReq = db.prepare(`
        INSERT INTO collection_requests (bin_id, priority, status, source, complaint_id)
        VALUES (?, 'urgent', 'pending', 'complaint', ?)
      `);
      const reqInfo = insertReq.run(targetBinId, complaintId);
      requestId = reqInfo.lastInsertRowid;
    } else {
      db.prepare("UPDATE collection_requests SET source = 'complaint', complaint_id = ? WHERE id = ?").run(complaintId, requestId);
    }

    // Transaction to update request, driver, vehicle, and complaint
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE collection_requests
        SET assigned_driver_id = ?,
            assigned_at = CURRENT_TIMESTAMP,
            status = 'assigned'
        WHERE id = ?
      `).run(nearestDriver.id, requestId);

      db.prepare("UPDATE drivers SET availability = 'busy' WHERE id = ?").run(nearestDriver.id);

      if (nearestDriver.assigned_vehicle_id) {
        db.prepare("UPDATE vehicles SET status = 'on_route' WHERE id = ?").run(nearestDriver.assigned_vehicle_id);
      }

      // Notify assigned driver
      const notifMsg = `New collection task from citizen complaint: Bin ${bin.bin_code}, ${bin.location_name}`;
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'New Collection Task', ?, 'urgent')
      `).run(nearestDriver.user_id, notifMsg);

      // Advance complaint to 'assigned'
      const note = `Nearest driver ${nearestDriver.name} (${nearestDriver.distanceKm !== null ? nearestDriver.distanceKm + ' km' : 'closest'}) assigned for collection.`;
      db.prepare(`
        UPDATE complaints
        SET status = 'assigned',
            assigned_driver_id = ?,
            resolution_note = ?
        WHERE id = ?
      `).run(nearestDriver.id, note, complaintId);

      // Notify citizen
      const citizenMsg = `Driver ${nearestDriver.name} has been assigned to collect your reported bin ${bin.bin_code}.`;
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Driver Assigned', ?, 'info')
      `).run(complaint.citizen_id, citizenMsg);
    });

    transaction();

    const updatedComplaint = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(complaintId);
    const updatedRequest = db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(requestId);

    const io = getIo(req);
    if (io) {
      io.emit('complaint:updated', updatedComplaint);
      io.emit('request:updated', { ...updatedRequest, driver_name: nearestDriver.name, bin_code: bin.bin_code });
      io.emit('driver:updated', { id: nearestDriver.id, availability: 'busy' });
      io.emit('notification:new');
    }

    saveComplaintToMongo(updatedComplaint);
    saveRequestToMongo(updatedRequest);

    res.json({
      message: `Nearest driver ${nearestDriver.name} (${nearestDriver.distanceKm !== null ? nearestDriver.distanceKm + ' km away' : 'closest'}) assigned to Complaint #${complaintId}`,
      driver: nearestDriver,
      complaint: updatedComplaint,
      request: updatedRequest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints/:id/unassign - Unassign driver from complaint & linked collection request
router.post('/:id/unassign', (req, res) => {
  try {
    const complaintId = req.params.id;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const previousDriverId = complaint.assigned_driver_id;

    // Find linked collection request
    const linkedReq = db.prepare("SELECT * FROM collection_requests WHERE complaint_id = ? OR (bin_id = ? AND status IN ('assigned', 'pending'))").get(complaintId, complaint.bin_id);

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE complaints
        SET status = 'open',
            assigned_driver_id = NULL,
            resolution_note = 'Driver unassigned by administrator; pending reassignment.'
        WHERE id = ?
      `).run(complaintId);

      if (linkedReq) {
        db.prepare(`
          UPDATE collection_requests
          SET assigned_driver_id = NULL,
              assigned_at = NULL,
              status = 'pending'
          WHERE id = ?
        `).run(linkedReq.id);
      }

      if (previousDriverId) {
        const otherTasks = db.prepare(`
          SELECT id FROM collection_requests
          WHERE assigned_driver_id = ? AND status IN ('assigned', 'in_progress')
        `).all(previousDriverId);

        if (otherTasks.length === 0) {
          db.prepare("UPDATE drivers SET availability = 'available' WHERE id = ?").run(previousDriverId);
          const drv = db.prepare('SELECT assigned_vehicle_id FROM drivers WHERE id = ?').get(previousDriverId);
          if (drv && drv.assigned_vehicle_id) {
            db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(drv.assigned_vehicle_id);
          }
        }
      }
    });

    transaction();

    const updatedComp = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(complaintId);
    const updatedReq = linkedReq ? db.prepare('SELECT * FROM collection_requests WHERE id = ?').get(linkedReq.id) : null;

    let updatedDriver = null;
    if (previousDriverId) {
      updatedDriver = db.prepare(`
        SELECT d.id, u.name, d.availability
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = ?
      `).get(previousDriverId);
    }

    const io = getIo(req);
    if (io) {
      io.emit('complaint:updated', updatedComp);
      if (updatedReq) {
        io.emit('request:updated', updatedReq);
        io.emit('requests:updated');
      }
      if (updatedDriver) {
        io.emit('driver:updated', updatedDriver);
      }
      io.emit('notification:new');
    }

    saveComplaintToMongo(updatedComp);
    if (updatedReq) saveRequestToMongo(updatedReq);

    res.json({
      message: `Driver unassigned from complaint #${complaintId}.`,
      complaint: updatedComp,
      request: updatedReq
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints/:id/mark-damaged - One-click mark bin damaged
router.post('/:id/mark-damaged', (req, res) => {
  try {
    const complaintId = req.params.id;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (!complaint.bin_id) {
      return res.status(400).json({ error: 'Complaint is not linked to a specific bin' });
    }

    // Set bin status to damaged
    db.prepare("UPDATE bins SET status = 'damaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(complaint.bin_id);
    const updatedBin = db.prepare('SELECT * FROM bins WHERE id = ?').get(complaint.bin_id);

    // Update complaint status to in_progress
    const note = `Bin ${updatedBin.bin_code} inspected and tagged as damaged. Maintenance order logged.`;
    db.prepare(`
      UPDATE complaints
      SET status = 'in_progress',
          resolution_note = ?
      WHERE id = ?
    `).run(note, complaintId);

    const updatedComplaint = db.prepare(complaintSelectQuery + ' WHERE c.id = ?').get(complaintId);

    // Notify citizen
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Bin Maintenance Scheduled', ?, 'info')
    `).run(complaint.citizen_id, `Your report #${complaintId}: Bin ${updatedBin.bin_code} has been marked as damaged and scheduled for maintenance.`);

    const io = getIo(req);
    if (io) {
      io.emit('bin:updated', updatedBin);
      io.emit('complaint:updated', updatedComplaint);
      io.emit('notification:new');
    }

    saveComplaintToMongo(updatedComplaint);
    saveBinToMongo(updatedBin);

    res.json({
      message: `Bin ${updatedBin.bin_code} marked as damaged and maintenance scheduled.`,
      complaint: updatedComplaint,
      bin: updatedBin
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/complaints/:id - Delete complaint
router.delete('/:id', (req, res) => {
  try {
    const complaintId = req.params.id;
    const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });

    db.prepare('DELETE FROM complaints WHERE id = ?').run(complaintId);

    if (existing.photo_url) {
      deleteFile(existing.photo_url).catch(err =>
        console.error('[Storage Error] Failed to delete photo:', err.message)
      );
    }

    const io = getIo(req);
    if (io) {
      io.emit('complaint:deleted', { id: Number(complaintId) });
    }

    deleteFromMongo('Complaint', complaintId);

    res.json({ message: 'Complaint deleted successfully', id: Number(complaintId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
