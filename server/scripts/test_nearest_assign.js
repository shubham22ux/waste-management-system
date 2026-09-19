import db from '../src/db/index.js';
import { haversineDistanceKm } from '../src/utils/distance.js';

console.log('--- Testing Distance Function ---');
const dist = haversineDistanceKm(12.9716, 77.5946, 12.9784, 77.6408);
console.log(`Distance between MG Road and Indiranagar: ${dist.toFixed(2)} km`);

console.log('\n--- Testing Nearest Driver Logic for Bin 1 ---');
const bin = db.prepare('SELECT * FROM bins WHERE id = 1').get();
console.log(`Bin 1: ${bin.bin_code} at ${bin.location_name} (${bin.latitude}, ${bin.longitude})`);

const availableDrivers = db.prepare(`
  SELECT d.id, u.name, u.phone, d.availability, v.plate_number AS vehicle_plate, d.currentLatitude, d.currentLongitude
  FROM drivers d
  JOIN users u ON d.user_id = u.id
  LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
  WHERE d.availability = 'available'
`).all();

console.log(`Found ${availableDrivers.length} available drivers`);
const withDist = availableDrivers.map(d => ({
  ...d,
  distanceKm: Math.round(haversineDistanceKm(bin.latitude, bin.longitude, d.currentLatitude, d.currentLongitude) * 100) / 100
})).sort((a, b) => a.distanceKm - b.distanceKm);

withDist.forEach((d, idx) => {
  console.log(`[${idx === 0 ? 'NEAREST' : '       '}] Driver ${d.id}: ${d.name} (${d.vehicle_plate}) - ${d.distanceKm} km away`);
});

console.log('\n--- Testing Requests Sorting ---');
const requests = db.prepare(`
  SELECT cr.id, cr.bin_id, b.bin_code, cr.priority, cr.status, cr.source, cr.created_at
  FROM collection_requests cr
  JOIN bins b ON cr.bin_id = b.id
  WHERE cr.status = 'pending'
`).all();

const priorityMap = { urgent: 1, high: 2, normal: 3 };
requests.sort((a, b) => {
  const pA = priorityMap[a.priority] || 4;
  const pB = priorityMap[b.priority] || 4;
  if (pA !== pB) return pA - pB;
  return new Date(a.created_at) - new Date(b.created_at);
});

requests.forEach(r => {
  console.log(`Req #${r.id} | Bin: ${r.bin_code} | Priority: ${r.priority.toUpperCase()} | Source: ${r.source} | Created: ${r.created_at}`);
});

console.log('\nVerification completed successfully!');
