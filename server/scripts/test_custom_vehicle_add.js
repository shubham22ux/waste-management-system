const BASE_URL = 'http://localhost:5000/api';

async function testCustomVehicleAdd() {
  console.log('Testing manual vehicle creation with custom manufacturer and model...');

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@smartwaste.gov', password: 'password123' })
  });
  const { token } = await loginRes.json();

  const testVehicles = [
    {
      company: 'BharatBenz',
      model: '2823R Heavy-Duty Hydraulic Compactor',
      plate_number: `MH-12-BB-${Date.now().toString().slice(-4)}`,
      fuel_type: 'Diesel',
      tank_capacity: 210,
      avg_mileage_kmpl: 4.8,
      status: 'available'
    },
    {
      company: 'Volvo',
      model: 'FE Electric Rear Loader Waste Truck',
      plate_number: `DL-01-EV-${Date.now().toString().slice(-4)}`,
      fuel_type: 'Electric',
      tank_capacity: 265,
      avg_mileage_kmpl: 1.2,
      status: 'available'
    },
    {
      company: 'Isuzu',
      model: 'Forward F-Series Dumper Placer',
      plate_number: `KA-04-IS-${Date.now().toString().slice(-4)}`,
      fuel_type: 'Bio-CNG',
      tank_capacity: 180,
      avg_mileage_kmpl: 5.5,
      status: 'available'
    }
  ];

  for (const v of testVehicles) {
    const combinedModel = `${v.company} ${v.model}`;
    console.log(`Adding custom vehicle: ${combinedModel} (${v.plate_number})...`);
    const res = await fetch(`${BASE_URL}/vehicles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        plate_number: v.plate_number,
        model: combinedModel,
        fuel_type: v.fuel_type,
        tank_capacity: v.tank_capacity,
        avg_mileage_kmpl: v.avg_mileage_kmpl,
        status: v.status
      })
    });

    if (!res.ok) {
      console.error('Failed to create vehicle:', await res.text());
      process.exit(1);
    }
    const created = await res.json();
    console.log(`-> Created vehicle ID ${created.id}: ${created.model} [${created.fuel_type}]`);
  }

  console.log('All custom vehicles created successfully!');
}

testCustomVehicleAdd().catch(err => {
  console.error(err);
  process.exit(1);
});
