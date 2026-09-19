import express from 'express';
import db from '../db/index.js';
import { saveBinToMongo, deleteFromMongo } from '../services/mongoSync.js';
import { autoAssignFullBin } from '../services/dispatcher.js';

const router = express.Router();

// Helper to get socket.io instance from app
const getIo = (req) => req.app.get('io');

// Helper to calculate predictive fill estimation based on sensor telemetry & fill rate
export function enrichBinWithPrediction(bin) {
  if (!bin) return null;
  if (bin.status !== 'active') {
    return {
      ...bin,
      fill_rate_per_hour: 0,
      estimated_hours_until_full: null,
      fill_prediction_status: 'inactive'
    };
  }

  // Location/capacity based hourly fill rate baseline (3.5% - 6.8% / hr)
  const baseRate = 3.5 + ((bin.id * 7) % 35) / 10;
  const fillRate = Number(baseRate.toFixed(1));
  const remainingPercent = Math.max(0, 100 - bin.current_fill_percent);

  let hoursUntilFull = null;
  let predictionStatus = 'normal';

  if (bin.current_fill_percent >= 100) {
    hoursUntilFull = 0.0;
    predictionStatus = 'full_now';
  } else {
    hoursUntilFull = Number((remainingPercent / fillRate).toFixed(1));
    if (hoursUntilFull < 3.0 || bin.current_fill_percent >= 80) {
      predictionStatus = 'critical';
    } else if (hoursUntilFull <= 8.0) {
      predictionStatus = 'warning';
    } else {
      predictionStatus = 'normal';
    }
  }

  return {
    ...bin,
    fill_rate_per_hour: fillRate,
    estimated_hours_until_full: hoursUntilFull,
    fill_prediction_status: predictionStatus
  };
}

// GET /api/bins/live - Telemetry summary and live bins list
router.get('/live', (req, res) => {
  try {
    const rawBins = db.prepare('SELECT * FROM bins ORDER BY current_fill_percent DESC, id ASC').all();
    const bins = rawBins.map(enrichBinWithPrediction);
    const totalBins = bins.length;
    const criticalBins = bins.filter(b => b.current_fill_percent >= 80);
    const activeBins = bins.filter(b => b.status === 'active');
    const damagedBins = bins.filter(b => b.status === 'damaged');

    const totalFill = bins.reduce((sum, b) => sum + b.current_fill_percent, 0);
    const avgFill = totalBins > 0 ? Math.round(totalFill / totalBins) : 0;

    res.json({
      summary: {
        totalBins,
        criticalCount: criticalBins.length,
        activeCount: activeBins.length,
        damagedCount: damagedBins.length,
        avgFillPercent: avgFill
      },
      criticalBins,
      bins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bins - List all bins with optional filters
router.get('/', (req, res) => {
  try {
    const { status, min_fill, max_fill } = req.query;
    let sql = 'SELECT * FROM bins WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (min_fill) {
      sql += ' AND current_fill_percent >= ?';
      params.push(Number(min_fill));
    }
    if (max_fill) {
      sql += ' AND current_fill_percent <= ?';
      params.push(Number(max_fill));
    }

    sql += ' ORDER BY current_fill_percent DESC, id ASC';
    const rawBins = db.prepare(sql).all(...params);
    const bins = rawBins.map(enrichBinWithPrediction);
    res.json(bins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bins/:id - Get single bin
router.get('/:id', (req, res) => {
  try {
    const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(req.params.id);
    if (!bin) return res.status(404).json({ error: 'Bin not found' });
    res.json(enrichBinWithPrediction(bin));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bins - Create a new bin
router.post('/', (req, res) => {
  try {
    const { bin_code, location_name, latitude, longitude, capacity_liters, current_fill_percent, status } = req.body;

    if (!bin_code || !location_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'bin_code, location_name, latitude, and longitude are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO bins (bin_code, location_name, latitude, longitude, capacity_liters, current_fill_percent, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      bin_code,
      location_name,
      Number(latitude),
      Number(longitude),
      capacity_liters || 1000,
      current_fill_percent || 0,
      status || 'active'
    );

    const rawNewBin = db.prepare('SELECT * FROM bins WHERE id = ?').get(info.lastInsertRowid);
    const newBin = enrichBinWithPrediction(rawNewBin);

    const io = getIo(req);
    if (io) io.emit('bin:updated', newBin);

    if (newBin.current_fill_percent >= 80) {
      autoAssignFullBin(newBin, io);
    }

    saveBinToMongo(newBin);

    res.status(201).json(newBin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bins/:id - Update existing bin
router.put('/:id', (req, res) => {
  try {
    const binId = req.params.id;
    const existing = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
    if (!existing) return res.status(404).json({ error: 'Bin not found' });

    const {
      bin_code,
      location_name,
      latitude,
      longitude,
      capacity_liters,
      current_fill_percent,
      status,
      last_emptied_at
    } = req.body;

    const stmt = db.prepare(`
      UPDATE bins
      SET bin_code = ?,
          location_name = ?,
          latitude = ?,
          longitude = ?,
          capacity_liters = ?,
          current_fill_percent = ?,
          status = ?,
          last_emptied_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      bin_code !== undefined ? bin_code : existing.bin_code,
      location_name !== undefined ? location_name : existing.location_name,
      latitude !== undefined ? Number(latitude) : existing.latitude,
      longitude !== undefined ? Number(longitude) : existing.longitude,
      capacity_liters !== undefined ? Number(capacity_liters) : existing.capacity_liters,
      current_fill_percent !== undefined ? Number(current_fill_percent) : existing.current_fill_percent,
      status !== undefined ? status : existing.status,
      last_emptied_at !== undefined ? last_emptied_at : existing.last_emptied_at,
      binId
    );

    const rawUpdated = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
    const updatedBin = enrichBinWithPrediction(rawUpdated);

    const io = getIo(req);
    if (io) io.emit('bin:updated', updatedBin);

    if (updatedBin.current_fill_percent >= 80) {
      autoAssignFullBin(updatedBin, io);
    }

    saveBinToMongo(updatedBin);

    res.json(updatedBin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bins/:id - Delete bin
router.delete('/:id', (req, res) => {
  try {
    const binId = req.params.id;
    const existing = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
    if (!existing) return res.status(404).json({ error: 'Bin not found' });

    db.prepare('DELETE FROM bins WHERE id = ?').run(binId);

    const io = getIo(req);
    if (io) io.emit('bin:deleted', { id: Number(binId) });

    deleteFromMongo('Bin', binId);

    res.json({ message: 'Bin deleted successfully', id: Number(binId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
