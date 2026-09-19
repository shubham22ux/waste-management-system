import express from 'express';
import db from '../db/index.js';
import { saveFuelLogToMongo, deleteFromMongo } from '../services/mongoSync.js';

const router = express.Router();

const getIo = (req) => req.app.get('io');

const fuelLogQuery = `
  SELECT 
    fl.id,
    fl.vehicle_id,
    fl.route_id,
    fl.liters_filled,
    fl.cost,
    fl.odometer_km,
    fl.log_date,
    v.plate_number,
    v.model,
    v.fuel_type,
    v.avg_mileage_kmpl,
    r.name AS route_name,
    r.total_distance_km
  FROM fuel_logs fl
  JOIN vehicles v ON fl.vehicle_id = v.id
  LEFT JOIN routes r ON fl.route_id = r.id
`;

// GET /api/fuel-logs/analytics - Aggregated visual analytics & health metrics
router.get('/analytics', (req, res) => {
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles ORDER BY id ASC').all();

    // 1. Calculate vehicle efficiency and health status
    const vehicleEfficiency = vehicles.map((v) => {
      const logs = db.prepare(`
        SELECT odometer_km, liters_filled, cost, log_date 
        FROM fuel_logs 
        WHERE vehicle_id = ? 
        ORDER BY odometer_km ASC
      `).all(v.id);

      let totalKm = 0;
      let totalLiters = 0;
      let totalCost = 0;

      if (logs.length >= 2) {
        for (let i = 1; i < logs.length; i++) {
          const diff = logs[i].odometer_km - logs[i - 1].odometer_km;
          if (diff > 0) {
            totalKm += diff;
            totalLiters += logs[i].liters_filled;
          }
        }
        totalCost = logs.reduce((acc, l) => acc + l.cost, 0);
      } else if (logs.length === 1) {
        totalKm = 0;
        totalLiters = logs[0].liters_filled;
        totalCost = logs[0].cost;
      }

      const actualMileage = totalLiters > 0 && totalKm > 0
        ? Number((totalKm / totalLiters).toFixed(2))
        : v.avg_mileage_kmpl;

      const deviationPercent = Number(
        (((actualMileage - v.avg_mileage_kmpl) / v.avg_mileage_kmpl) * 100).toFixed(1)
      );

      let status = 'Good';
      let statusColor = 'emerald';
      if (deviationPercent < -15) {
        status = 'Alert';
        statusColor = 'rose';
      } else if (deviationPercent < -5) {
        status = 'Check';
        statusColor = 'amber';
      }

      return {
        vehicle_id: v.id,
        plate_number: v.plate_number,
        model: v.model,
        fuel_type: v.fuel_type,
        rated_mileage: v.avg_mileage_kmpl,
        actual_mileage: actualMileage,
        deviation_percent: deviationPercent,
        status,
        status_color: statusColor,
        total_km: totalKm,
        total_liters: Number(totalLiters.toFixed(1)),
        total_cost: totalCost,
        log_count: logs.length
      };
    });

    // 2. Summary cards metrics
    const currentMonthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    const currentMonthTotals = db.prepare(`
      SELECT 
        COALESCE(SUM(cost), 0) AS total_cost,
        COALESCE(SUM(liters_filled), 0) AS total_liters
      FROM fuel_logs
      WHERE strftime('%Y-%m', log_date) = ?
    `).get(currentMonthStr);

    // If current month has minimal data, fallback to past 30 days sum
    let totalCostThisMonth = currentMonthTotals.total_cost;
    let totalLitersThisMonth = Number(currentMonthTotals.total_liters.toFixed(1));

    if (totalCostThisMonth === 0) {
      const past30Totals = db.prepare(`
        SELECT 
          COALESCE(SUM(cost), 0) AS total_cost,
          COALESCE(SUM(liters_filled), 0) AS total_liters
        FROM fuel_logs
        WHERE log_date >= date('now', '-30 days')
      `).get();
      totalCostThisMonth = past30Totals.total_cost;
      totalLitersThisMonth = Number(past30Totals.total_liters.toFixed(1));
    }

    // Sort to determine most and least efficient vehicles
    const sortedByEfficiency = [...vehicleEfficiency].sort((a, b) => b.deviation_percent - a.deviation_percent);
    const mostEfficient = sortedByEfficiency[0] || null;
    const leastEfficient = sortedByEfficiency[sortedByEfficiency.length - 1] || null;

    // 3. Monthly Fuel Cost Trend (last 6 months)
    const monthlyTrend = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      const monthLabel = d.toLocaleString('default', { month: 'short', year: 'numeric' });

      const monthLogs = db.prepare(`
        SELECT vehicle_id, SUM(cost) AS cost, SUM(liters_filled) as liters
        FROM fuel_logs
        WHERE strftime('%Y-%m', log_date) = ?
        GROUP BY vehicle_id
      `).all(ym);

      const entry = {
        month: monthLabel,
        total_cost: 0
      };

      vehicles.forEach((v) => {
        const found = monthLogs.find((l) => l.vehicle_id === v.id);
        const costVal = found ? found.cost : 0;
        entry[v.plate_number] = costVal;
        entry.total_cost += costVal;
      });

      monthlyTrend.push(entry);
    }

    // 4. Liters consumed per vehicle for BarChart
    const litersPerVehicle = vehicles.map((v) => {
      const row = db.prepare(`
        SELECT 
          COALESCE(SUM(liters_filled), 0) AS total_liters,
          COALESCE(SUM(cost), 0) AS total_cost
        FROM fuel_logs
        WHERE vehicle_id = ?
      `).get(v.id);

      return {
        vehicle_id: v.id,
        plate_number: v.plate_number,
        model: v.model,
        fuel_type: v.fuel_type,
        total_liters: Number(row.total_liters.toFixed(1)),
        total_cost: row.total_cost,
        avg_cost_per_liter: row.total_liters > 0 ? Math.round(row.total_cost / row.total_liters) : 94.5
      };
    });

    // 5. Cost-per-route metric for routes linked to fuel logs
    const costPerRoute = db.prepare(`
      SELECT 
        fl.id AS log_id,
        fl.route_id,
        fl.cost,
        fl.liters_filled,
        fl.log_date,
        r.name AS route_name,
        r.total_distance_km,
        v.plate_number,
        v.model AS vehicle_model
      FROM fuel_logs fl
      JOIN routes r ON fl.route_id = r.id
      JOIN vehicles v ON fl.vehicle_id = v.id
      WHERE fl.route_id IS NOT NULL AND r.total_distance_km > 0
      ORDER BY fl.log_date DESC
      LIMIT 10
    `).all().map((item) => {
      return {
        ...item,
        cost_per_km: Number((item.cost / item.total_distance_km).toFixed(2))
      };
    });

    const avgCostPerKm = costPerRoute.length > 0
      ? Number((costPerRoute.reduce((sum, r) => sum + r.cost_per_km, 0) / costPerRoute.length).toFixed(2))
      : 24.5;

    res.json({
      summary: {
        total_cost_this_month: totalCostThisMonth,
        total_liters_this_month: totalLitersThisMonth,
        most_efficient_vehicle: mostEfficient,
        least_efficient_vehicle: leastEfficient,
        avg_cost_per_km: avgCostPerKm
      },
      monthly_trend: monthlyTrend,
      liters_per_vehicle: litersPerVehicle,
      vehicle_efficiency: vehicleEfficiency,
      cost_per_route: costPerRoute
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fuel-logs - List all fuel logs
router.get('/', (req, res) => {
  try {
    const { vehicle_id } = req.query;
    let sql = fuelLogQuery + ' WHERE 1=1';
    const params = [];

    if (vehicle_id && vehicle_id !== 'all') {
      sql += ' AND fl.vehicle_id = ?';
      params.push(vehicle_id);
    }

    sql += ' ORDER BY fl.log_date DESC, fl.id DESC';
    const logs = db.prepare(sql).all(...params);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fuel-logs - Create new fuel log entry
router.post('/', (req, res) => {
  try {
    const { vehicle_id, route_id, liters_filled, cost, odometer_km, log_date } = req.body;

    if (!vehicle_id || liters_filled === undefined || odometer_km === undefined) {
      return res.status(400).json({ error: 'vehicle_id, liters_filled, and odometer_km are required.' });
    }

    const liters = Number(liters_filled);
    const odometer = Number(odometer_km);
    const calculatedCost = cost !== undefined && cost !== '' ? Number(cost) : Math.round(liters * 94.5);
    const date = log_date || new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`
      INSERT INTO fuel_logs (vehicle_id, route_id, liters_filled, cost, odometer_km, log_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      Number(vehicle_id),
      route_id ? Number(route_id) : null,
      liters,
      calculatedCost,
      odometer,
      date
    );

    const created = db.prepare(fuelLogQuery + ' WHERE fl.id = ?').get(info.lastInsertRowid);
    const io = getIo(req);
    if (io) {
      io.emit('fuel:logged', created);
    }

    saveFuelLogToMongo(created);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/fuel-logs/:id - Update fuel log
router.put('/:id', (req, res) => {
  try {
    const logId = req.params.id;
    const existing = db.prepare('SELECT * FROM fuel_logs WHERE id = ?').get(logId);
    if (!existing) {
      return res.status(404).json({ error: 'Fuel log entry not found.' });
    }

    const { vehicle_id, route_id, liters_filled, cost, odometer_km, log_date } = req.body;

    const stmt = db.prepare(`
      UPDATE fuel_logs
      SET vehicle_id = ?,
          route_id = ?,
          liters_filled = ?,
          cost = ?,
          odometer_km = ?,
          log_date = ?
      WHERE id = ?
    `);

    stmt.run(
      vehicle_id !== undefined ? Number(vehicle_id) : existing.vehicle_id,
      route_id !== undefined ? (route_id ? Number(route_id) : null) : existing.route_id,
      liters_filled !== undefined ? Number(liters_filled) : existing.liters_filled,
      cost !== undefined ? Number(cost) : existing.cost,
      odometer_km !== undefined ? Number(odometer_km) : existing.odometer_km,
      log_date !== undefined ? log_date : existing.log_date,
      logId
    );

    const updated = db.prepare(fuelLogQuery + ' WHERE fl.id = ?').get(logId);
    const io = getIo(req);
    if (io) {
      io.emit('fuel:updated', updated);
    }

    saveFuelLogToMongo(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fuel-logs/:id - Delete fuel log
router.delete('/:id', (req, res) => {
  try {
    const logId = req.params.id;
    const existing = db.prepare('SELECT * FROM fuel_logs WHERE id = ?').get(logId);
    if (!existing) {
      return res.status(404).json({ error: 'Fuel log entry not found.' });
    }

    db.prepare('DELETE FROM fuel_logs WHERE id = ?').run(logId);
    const io = getIo(req);
    if (io) {
      io.emit('fuel:deleted', { id: Number(logId) });
    }

    deleteFromMongo('FuelLog', logId);

    res.json({ message: 'Fuel log deleted successfully', id: Number(logId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
