import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

console.log('Connecting to Socket.IO on http://localhost:5000...');
const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling']
});

let eventCount = 0;

socket.on('connect', () => {
  console.log(`[Socket Connected] Socket ID: ${socket.id}`);
  console.log('Listening for "driver:location" live movement events for 15 seconds...\n');
});

socket.on('driver:location', (data) => {
  eventCount++;
  console.log(`[EVENT #${eventCount} driver:location] Driver #${data.id} (${data.name}) moved:`);
  console.log(`   Availability: ${data.availability} | Vehicle: ${data.vehicle_plate || data.vehiclePlate}`);
  console.log(`   New Coordinates: [${data.currentLatitude}, ${data.currentLongitude}]`);
  console.log(`   Current Task: ${data.current_task || 'Idle'}`);
  console.log(`   Timestamp: ${data.locationUpdatedAt}\n`);

  if (eventCount >= 5) {
    console.log('[SUCCESS] Confirmed live driver movement Socket.IO events are being broadcast and received!');
    socket.disconnect();
    process.exit(0);
  }
});

setTimeout(() => {
  if (eventCount === 0) {
    console.error('[TIMEOUT] No driver:location events received within 18 seconds.');
    socket.disconnect();
    process.exit(1);
  } else {
    console.log(`[SUCCESS] Received ${eventCount} driver:location events during test!`);
    socket.disconnect();
    process.exit(0);
  }
}, 18000);
