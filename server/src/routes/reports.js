import express from 'express';
import db from '../db/index.js';
import { DEPOT_CONFIG } from '../config/depot.js';

const router = express.Router();

// GET /api/reports/monthly-summary - Aggregated operational report data
router.get('/monthly-summary', (req, res) => {
  try {
    const monthQuery = req.query.month; // Optional 'YYYY-MM'
    const now = new Date();
    const targetMonth = monthQuery || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Collections completed
    const collectionsCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM collection_requests 
      WHERE status = 'completed'
    `).get()?.count || 0;

    // 2. Routes completed
    const routesStats = db.prepare(`
      SELECT 
        COUNT(*) as total_routes,
        COALESCE(SUM(total_distance_km), 0) as total_distance
      FROM routes 
      WHERE status = 'completed'
    `).get();

    // 3. Fuel consumption & cost
    const fuelStats = db.prepare(`
      SELECT 
        COALESCE(SUM(liters_filled), 0) as total_liters,
        COALESCE(SUM(cost), 0) as total_cost
      FROM fuel_logs
    `).get();

    // 4. Citizen Complaints
    const complaintsTotal = db.prepare('SELECT COUNT(*) as count FROM complaints').get()?.count || 0;
    const complaintsResolved = db.prepare("SELECT COUNT(*) as count FROM complaints WHERE status = 'resolved'").get()?.count || 0;
    const resolutionRate = complaintsTotal > 0 ? Math.round((complaintsResolved / complaintsTotal) * 100) : 100;

    // 5. Recent Completed Routes breakdown
    const completedRoutes = db.prepare(`
      SELECT 
        r.id,
        r.name,
        r.total_distance_km,
        r.completed_at,
        u.name as driver_name,
        v.plate_number as vehicle_plate,
        (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count
      FROM routes r
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.status = 'completed'
      ORDER BY r.completed_at DESC
      LIMIT 15
    `).all();

    // 6. Fleet Fuel Breakdown
    const vehicleFuel = db.prepare(`
      SELECT 
        v.plate_number,
        v.model,
        v.fuel_type,
        v.avg_mileage_kmpl,
        COALESCE(SUM(fl.liters_filled), 0) as total_liters,
        COALESCE(SUM(fl.cost), 0) as total_cost,
        COUNT(fl.id) as log_count
      FROM vehicles v
      LEFT JOIN fuel_logs fl ON v.id = fl.vehicle_id
      GROUP BY v.id
      ORDER BY total_cost DESC
    `).all();

    // 7. Complaints by category
    const complaintsByCategory = db.prepare(`
      SELECT 
        type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
      FROM complaints
      GROUP BY type
    `).all();

    res.json({
      report_title: 'SmartWaste Municipal Solid Waste Monthly Operations Report',
      month: targetMonth,
      generated_at: new Date().toISOString(),
      depot: DEPOT_CONFIG,
      kpis: {
        collections_completed: collectionsCount,
        routes_completed: routesStats?.total_routes || 0,
        total_distance_km: Number((routesStats?.total_distance || 0).toFixed(2)),
        total_fuel_liters: Number((fuelStats?.total_liters || 0).toFixed(1)),
        total_fuel_cost: Number((fuelStats?.total_cost || 0).toFixed(2)),
        complaints_total: complaintsTotal,
        complaints_resolved: complaintsResolved,
        resolution_rate_percent: resolutionRate
      },
      completed_routes: completedRoutes,
      vehicle_fuel_summary: vehicleFuel,
      complaints_by_category: complaintsByCategory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
