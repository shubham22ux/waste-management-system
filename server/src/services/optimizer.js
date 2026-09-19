import { DEPOT_CONFIG } from '../config/depot.js';
import { haversineDistanceKm } from '../utils/distance.js';

export { haversineDistanceKm };

/**
 * Computes the total distance of a tour including the start depot and return to depot.
 * Tour array format: [depot, stop1, stop2, ..., stopN, depot]
 */
export function calculateTourDistance(tour) {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += haversineDistanceKm(
      tour[i].latitude,
      tour[i].longitude,
      tour[i + 1].latitude,
      tour[i + 1].longitude
    );
  }
  return total;
}

/**
 * Solves the Traveling Salesperson Problem (TSP) for a set of collection stops starting and ending at the depot.
 * Uses Nearest Neighbor construction followed by a 2-Opt local search improvement pass.
 *
 * @param {Array} stops Array of bin objects with latitude and longitude
 * @param {Object} [depot=DEPOT_CONFIG] Central depot location
 * @returns {{ orderedStops: Array, totalDistanceKm: number, initialDistanceKm: number }}
 */
export function optimizeRoute(stops, depot = DEPOT_CONFIG) {
  if (!stops || stops.length === 0) {
    return { orderedStops: [], totalDistanceKm: 0, initialDistanceKm: 0 };
  }

  if (stops.length === 1) {
    const singleDist =
      haversineDistanceKm(depot.latitude, depot.longitude, stops[0].latitude, stops[0].longitude) * 2;
    return {
      orderedStops: [...stops],
      totalDistanceKm: Number(singleDist.toFixed(2)),
      initialDistanceKm: Number(singleDist.toFixed(2))
    };
  }

  // --- Step 1: Nearest Neighbor Heuristic ---
  const unvisited = [...stops];
  let current = depot;
  const nnOrder = [];

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineDistanceKm(
        current.latitude,
        current.longitude,
        unvisited[i].latitude,
        unvisited[i].longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }

    const nextStop = unvisited[nearestIndex];
    nnOrder.push(nextStop);
    current = nextStop;
    unvisited.splice(nearestIndex, 1);
  }

  // Tour: Depot -> stop1 -> stop2 -> ... -> stopN -> Depot
  let tour = [depot, ...nnOrder, depot];
  const initialDistance = calculateTourDistance(tour);

  // --- Step 2: 2-Opt Improvement Pass ---
  const N = nnOrder.length;
  let improved = true;
  let iterations = 0;
  const maxIterations = 200;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // i ranges from 1 to N - 1, k ranges from i + 1 to N
    // Indices in tour:
    // 0 is Depot
    // 1 to N are the stops
    // N + 1 is return to Depot
    for (let i = 1; i <= N - 1; i++) {
      for (let k = i + 1; k <= N; k++) {
        const p1 = tour[i - 1];
        const p2 = tour[i];
        const p3 = tour[k];
        const p4 = tour[k + 1];

        const currentEdgeDist =
          haversineDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude) +
          haversineDistanceKm(p3.latitude, p3.longitude, p4.latitude, p4.longitude);

        const newEdgeDist =
          haversineDistanceKm(p1.latitude, p1.longitude, p3.latitude, p3.longitude) +
          haversineDistanceKm(p2.latitude, p2.longitude, p4.latitude, p4.longitude);

        // If reversing the subsegment [i..k] yields a reduction
        if (newEdgeDist < currentEdgeDist - 1e-6) {
          // Reverse tour from index i to k
          const reversedSub = tour.slice(i, k + 1).reverse();
          tour = [...tour.slice(0, i), ...reversedSub, ...tour.slice(k + 1)];
          improved = true;
          break; // restart outer loop to re-evaluate
        }
      }
      if (improved) break;
    }
  }

  const finalDistance = calculateTourDistance(tour);
  const optimizedStops = tour.slice(1, N + 1);

  return {
    orderedStops: optimizedStops,
    totalDistanceKm: Number(finalDistance.toFixed(2)),
    initialDistanceKm: Number(initialDistance.toFixed(2))
  };
}

/**
 * Priority weighting for grouping urgent requests first
 */
const priorityWeights = {
  urgent: 1,
  high: 2,
  normal: 3
};

/**
 * Clusters pending collection requests into batches of up to maxPerBatch (default: 10) bins.
 * Uses spatial proximity and priority clustering so each route covers a coherent geographical sector.
 *
 * @param {Array} requests Pending collection request items
 * @param {number} [maxPerBatch=10] Max bins per route
 * @param {Object} [depot=DEPOT_CONFIG]
 * @returns {Array<Array>} Batches of requests
 */
export function clusterRequestsIntoBatches(requests, maxPerBatch = 10, depot = DEPOT_CONFIG) {
  if (!requests || requests.length === 0) return [];
  if (requests.length <= maxPerBatch) return [requests];

  // Clone requests list
  const unassigned = [...requests];

  // Sort initially by priority then distance to depot
  unassigned.sort((a, b) => {
    const pA = priorityWeights[a.priority] || 4;
    const pB = priorityWeights[b.priority] || 4;
    if (pA !== pB) return pA - pB;

    const distA = haversineDistanceKm(depot.latitude, depot.longitude, a.latitude, a.longitude);
    const distB = haversineDistanceKm(depot.latitude, depot.longitude, b.latitude, b.longitude);
    return distA - distB;
  });

  const batches = [];

  while (unassigned.length > 0) {
    // Pick the most urgent/nearest remaining item as cluster seed
    const seed = unassigned.shift();
    const currentBatch = [seed];

    // Find closest items to the seed to fill up to maxPerBatch
    while (currentBatch.length < maxPerBatch && unassigned.length > 0) {
      let closestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unassigned.length; i++) {
        const d = haversineDistanceKm(
          seed.latitude,
          seed.longitude,
          unassigned[i].latitude,
          unassigned[i].longitude
        );
        if (d < minDistance) {
          minDistance = d;
          closestIdx = i;
        }
      }

      currentBatch.push(unassigned.splice(closestIdx, 1)[0]);
    }

    batches.push(currentBatch);
  }

  return batches;
}
