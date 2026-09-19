import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceKm,
  calculateTourDistance,
  optimizeRoute,
  clusterRequestsIntoBatches
} from '../src/services/optimizer.js';

describe('Route Optimizer - Haversine Distance Calculation', () => {
  const depot = { latitude: 12.9716, longitude: 77.5946 }; // Bangalore Central Depot (Cubbon Park)
  const mgRoad = { latitude: 12.9756, longitude: 77.6066 }; // MG Road
  const indiranagar = { latitude: 12.9784, longitude: 77.6408 }; // 100 Feet Rd Indiranagar

  test('Distance between identical coordinates should be 0', () => {
    const dist = haversineDistanceKm(depot.latitude, depot.longitude, depot.latitude, depot.longitude);
    assert.equal(dist, 0);
  });

  test('Distance should be symmetric (dist(A, B) === dist(B, A))', () => {
    const d1 = haversineDistanceKm(depot.latitude, depot.longitude, mgRoad.latitude, mgRoad.longitude);
    const d2 = haversineDistanceKm(mgRoad.latitude, mgRoad.longitude, depot.latitude, depot.longitude);
    assert.ok(Math.abs(d1 - d2) < 1e-9, `Symmetry failed: ${d1} !== ${d2}`);
  });

  test('Calculates realistic distance between known Bangalore points (~1.38 km)', () => {
    const dist = haversineDistanceKm(depot.latitude, depot.longitude, mgRoad.latitude, mgRoad.longitude);
    // Distance between Cubbon Park and MG Road is approx 1.3 - 1.5 km
    assert.ok(dist >= 1.0 && dist <= 2.0, `Expected ~1.4 km, got ${dist} km`);
  });

  test('Triangle inequality holds: dist(A, C) <= dist(A, B) + dist(B, C)', () => {
    const dAC = haversineDistanceKm(depot.latitude, depot.longitude, indiranagar.latitude, indiranagar.longitude);
    const dAB = haversineDistanceKm(depot.latitude, depot.longitude, mgRoad.latitude, mgRoad.longitude);
    const dBC = haversineDistanceKm(mgRoad.latitude, mgRoad.longitude, indiranagar.latitude, indiranagar.longitude);
    assert.ok(dAC <= dAB + dBC + 1e-6, `Triangle inequality violated: ${dAC} > ${dAB} + ${dBC}`);
  });
});

describe('Route Optimizer - Tour Distance & Nearest Neighbor Sequence', () => {
  const depot = { latitude: 12.9716, longitude: 77.5946, name: 'Depot' };
  
  // Create 3 collinear stops at increasing distances along an easterly corridor
  const stopNear = { id: 1, bin_code: 'B-NEAR', latitude: 12.9720, longitude: 77.6000 };
  const stopMid = { id: 2, bin_code: 'B-MID', latitude: 12.9730, longitude: 77.6200 };
  const stopFar = { id: 3, bin_code: 'B-FAR', latitude: 12.9740, longitude: 77.6500 };

  test('calculateTourDistance correctly sums segment distances and returns to depot', () => {
    const tour = [depot, stopNear, stopMid, depot];
    const total = calculateTourDistance(tour);
    
    const d1 = haversineDistanceKm(depot.latitude, depot.longitude, stopNear.latitude, stopNear.longitude);
    const d2 = haversineDistanceKm(stopNear.latitude, stopNear.longitude, stopMid.latitude, stopMid.longitude);
    const d3 = haversineDistanceKm(stopMid.latitude, stopMid.longitude, depot.latitude, depot.longitude);
    
    assert.ok(Math.abs(total - (d1 + d2 + d3)) < 1e-9);
  });

  test('Nearest Neighbor selects the closest stop first from Depot', () => {
    // Input stops in reverse order (Far, Mid, Near)
    const reversedStops = [stopFar, stopMid, stopNear];
    const result = optimizeRoute(reversedStops, depot);

    assert.equal(result.orderedStops.length, 3);
    // The nearest neighbor should order: Near -> Mid -> Far
    assert.equal(result.orderedStops[0].bin_code, 'B-NEAR', 'First stop should be B-NEAR');
    assert.equal(result.orderedStops[1].bin_code, 'B-MID', 'Second stop should be B-MID');
    assert.equal(result.orderedStops[2].bin_code, 'B-FAR', 'Third stop should be B-FAR');
  });

  test('Empty stops input returns 0 distance and empty stops array', () => {
    const result = optimizeRoute([], depot);
    assert.equal(result.orderedStops.length, 0);
    assert.equal(result.totalDistanceKm, 0);
  });

  test('Single stop returns round trip distance to depot', () => {
    const result = optimizeRoute([stopNear], depot);
    assert.equal(result.orderedStops.length, 1);
    const expected = Number((haversineDistanceKm(depot.latitude, depot.longitude, stopNear.latitude, stopNear.longitude) * 2).toFixed(2));
    assert.equal(result.totalDistanceKm, expected);
  });
});

describe('Route Optimizer - 2-Opt Local Search Improvement Pass', () => {
  const depot = { latitude: 12.9716, longitude: 77.5946, name: 'Depot' };

  test('2-Opt pass preserves or reduces tour distance (totalDistanceKm <= initialDistanceKm)', () => {
    // 5 scattered stops around Bangalore center
    const stops = [
      { id: 10, latitude: 12.9352, longitude: 77.6245 }, // Koramangala
      { id: 11, latitude: 12.9784, longitude: 77.6408 }, // Indiranagar
      { id: 12, latitude: 12.9800, longitude: 77.5800 }, // Malleshwaram
      { id: 13, latitude: 12.9250, longitude: 77.5850 }, // Jayanagar
      { id: 14, latitude: 12.9900, longitude: 77.6100 }  // Frazer Town
    ];

    const result = optimizeRoute(stops, depot);
    assert.ok(result.totalDistanceKm > 0);
    assert.ok(
      result.totalDistanceKm <= result.initialDistanceKm + 1e-4,
      `2-Opt distance (${result.totalDistanceKm}) should be <= initial distance (${result.initialDistanceKm})`
    );
  });
});

describe('Route Optimizer - Spatial Clustering & Batching', () => {
  const depot = { latitude: 12.9716, longitude: 77.5946 };

  test('Batches requests into groups of at most maxPerBatch', () => {
    const requests = Array.from({ length: 25 }, (_, i) => ({
      request_id: i + 1,
      bin_id: i + 1,
      priority: i % 3 === 0 ? 'urgent' : 'normal',
      latitude: 12.95 + (i * 0.005),
      longitude: 77.55 + (i * 0.005)
    }));

    const batches = clusterRequestsIntoBatches(requests, 10, depot);
    assert.equal(batches.length, 3, '25 requests with max 10 per batch should produce 3 batches');
    assert.equal(batches[0].length, 10);
    assert.equal(batches[1].length, 10);
    assert.equal(batches[2].length, 5);
  });

  test('Urgent priority requests are prioritized in earlier batches', () => {
    const normalReqs = Array.from({ length: 8 }, (_, i) => ({
      request_id: i + 1,
      priority: 'normal',
      latitude: 12.97 + (i * 0.001),
      longitude: 77.59 + (i * 0.001)
    }));

    const urgentReq = {
      request_id: 99,
      priority: 'urgent',
      latitude: 12.975,
      longitude: 77.595
    };

    const batches = clusterRequestsIntoBatches([...normalReqs, urgentReq], 5, depot);
    // Urgent item should be placed in first batch
    const firstBatchIds = batches[0].map((r) => r.request_id);
    assert.ok(firstBatchIds.includes(99), 'First batch must contain urgent request');
  });
});
