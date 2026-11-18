import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createSchema } from './db/schema.js';
import { startIoTSimulator } from './services/simulator.js';
import authRouter from './routes/auth.js';
import binsRouter from './routes/bins.js';
import requestsRouter from './routes/requests.js';
import vehiclesRouter from './routes/vehicles.js';
import driversRouter from './routes/drivers.js';
import complaintsRouter from './routes/complaints.js';
import routesRouter from './routes/routes.js';
import driverRouter from './routes/driver.js';
import notificationsRouter from './routes/notifications.js';
import fuelLogsRouter from './routes/fuelLogs.js';
import reportsRouter from './routes/reports.js';
import analyticsRouter from './routes/analytics.js';
import aiRouter from './routes/ai.js';

import path from 'path';
import { fileURLToPath } from 'url';
import db from './db/index.js';
import { connectMongoDB, isMongoConnected } from './db/mongo.js';
import { syncAllToMongo } from './services/mongoSync.js';
import { isS3Configured } from './services/storageService.js';
import { isRekognitionConfigured } from './services/rekognitionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Store io instance in express app for route handlers
app.set('io', io);

// Ensure database schema exists on startup
createSchema();

// Connect to MongoDB and synchronize existing SQLite records
connectMongoDB().then(async (conn) => {
  if (conn) {
    await syncAllToMongo(db);
  }
});

app.use(cors());
app.use(express.json());

// Statically serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Start IoT background telemetry simulator
startIoTSimulator(io);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SmartWaste Express Backend is running',
    mongodb: isMongoConnected() ? 'connected (smartwaste)' : 'disconnected',
    aws: {
      s3Storage: isS3Configured() ? 'connected' : 'local-fallback',
      s3Bucket: process.env.AWS_S3_BUCKET || 'none',
      rekognition: isRekognitionConfigured() ? 'enabled' : 'disabled'
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Dashboard 5 Summary Cards Endpoint
app.get('/api/dashboard/summary', (req, res) => {
  try {
    const criticalBins = db.prepare(`
      SELECT COUNT(*) as count FROM bins 
      WHERE current_fill_percent >= 80 AND status != 'inactive'
    `).get().count;

    const pendingAssignments = db.prepare(`
      SELECT COUNT(*) as count FROM collection_requests 
      WHERE status = 'pending'
    `).get().count;

    const driversAvailable = db.prepare(`
      SELECT COUNT(*) as count FROM drivers 
      WHERE availability = 'available'
    `).get().count;

    const openComplaints = db.prepare(`
      SELECT COUNT(*) as count FROM complaints 
      WHERE status = 'open'
    `).get().count;

    const collectionsCompletedToday = db.prepare(`
      SELECT COUNT(*) as count FROM collection_requests 
      WHERE status = 'completed' AND (
        date(completed_at) = date('now', 'localtime') OR
        date(completed_at) = date('now')
      )
    `).get().count;

    res.json({
      criticalBins,
      pendingAssignments,
      driversAvailable,
      openComplaints,
      collectionsCompletedToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard Live Activity Feed Endpoint (Last 10 events)
app.get('/api/dashboard/activity', (req, res) => {
  try {
    const events = [];

    // 1. Completed collections
    const completed = db.prepare(`
      SELECT 
        cr.id,
        cr.completed_at AS timestamp,
        b.bin_code,
        u.name AS driver_name
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      LEFT JOIN drivers d ON cr.assigned_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE cr.status = 'completed' AND cr.completed_at IS NOT NULL
      ORDER BY cr.completed_at DESC
      LIMIT 10
    `).all();

    completed.forEach((c) => {
      events.push({
        id: `completed-${c.id}`,
        text: `${c.driver_name ? c.driver_name.split(' ')[0] : 'Driver'} collected ${c.bin_code}`,
        timestamp: c.timestamp,
        type: 'collection_completed'
      });
    });

    // 2. Driver assignments
    const assigned = db.prepare(`
      SELECT 
        cr.id,
        COALESCE(cr.assigned_at, cr.created_at) AS timestamp,
        b.bin_code,
        u.name AS driver_name
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      JOIN drivers d ON cr.assigned_driver_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE cr.assigned_driver_id IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 10
    `).all();

    assigned.forEach((a) => {
      events.push({
        id: `assigned-${a.id}`,
        text: `Admin assigned driver ${a.driver_name ? a.driver_name.split(' ')[0] : 'Driver'} to ${a.bin_code}`,
        timestamp: a.timestamp,
        type: 'driver_assigned'
      });
    });

    // 3. High fill alert events
    const criticalReqs = db.prepare(`
      SELECT 
        cr.id,
        cr.created_at AS timestamp,
        b.bin_code,
        b.current_fill_percent
      FROM collection_requests cr
      JOIN bins b ON cr.bin_id = b.id
      WHERE cr.priority = 'urgent' OR b.current_fill_percent >= 80
      ORDER BY cr.created_at DESC
      LIMIT 10
    `).all();

    criticalReqs.forEach((r) => {
      events.push({
        id: `bin-critical-${r.id}`,
        text: `Bin ${r.bin_code} crossed 80%`,
        timestamp: r.timestamp,
        type: 'bin_critical'
      });
    });

    // 4. Complaints (Resolved & Created)
    const complaints = db.prepare(`
      SELECT 
        c.id,
        c.status,
        c.created_at,
        c.resolved_at,
        b.bin_code
      FROM complaints c
      LEFT JOIN bins b ON c.bin_id = b.id
      ORDER BY COALESCE(c.resolved_at, c.created_at) DESC
      LIMIT 10
    `).all();

    complaints.forEach((cmp) => {
      if (cmp.status === 'resolved' && cmp.resolved_at) {
        events.push({
          id: `complaint-res-${cmp.id}`,
          text: `Complaint #${cmp.id} resolved`,
          timestamp: cmp.resolved_at,
          type: 'complaint_resolved'
        });
      } else {
        events.push({
          id: `complaint-new-${cmp.id}`,
          text: `Complaint #${cmp.id} filed${cmp.bin_code ? ` for ${cmp.bin_code}` : ''}`,
          timestamp: cmp.created_at,
          type: 'complaint_filed'
        });
      }
    });

    // Sort descending by timestamp, remove duplicate IDs, take top 10
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Deduplicate in case of close timestamp collisions
    const seen = new Set();
    const uniqueEvents = [];
    for (const ev of events) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        uniqueEvents.push(ev);
      }
      if (uniqueEvents.length >= 10) break;
    }

    res.json(uniqueEvents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/bins', binsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/complaints', complaintsRouter);
app.use('/api/routes', routesRouter);
app.use('/api/driver', driverRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/fuel-logs', fuelLogsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/ai', aiRouter);

server.listen(PORT, () => {
  console.log(`[Server] SmartWaste Express API & Socket.IO running on http://localhost:${PORT}`);
});
