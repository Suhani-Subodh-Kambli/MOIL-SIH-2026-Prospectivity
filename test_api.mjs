// Quick API test script
const BASE = 'http://localhost:5000/api';

async function main() {
  // Login
  const r1 = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@oretwin.ai', password: 'password123' })
  });
  const j1 = await r1.json();
  if (!j1.token) { console.error('Login failed:', j1); process.exit(1); }
  const token = j1.token;
  console.log('✓ Login OK');

  // Test zones
  const r2 = await fetch(`${BASE}/exploration/zones`, { headers: { Authorization: `Bearer ${token}` } });
  const zones = await r2.json();
  console.log(`✓ Zones count: ${zones.length}`);
  zones.forEach(z => console.log(`  ${z.zone_id} -> "${z.name}" lat:${z.center_lat} lon:${z.center_lon} score:${z.mean_score}`));

  // Test analyze (point)
  const r3 = await fetch(`${BASE}/exploration/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: 'point', lat: 21.6833, lon: 79.7333 })
  });
  const analysis = await r3.json();
  console.log(`✓ Point analysis: score=${analysis.score} distKm=${analysis.distanceKm}`);

  // Test predict
  const r4 = await fetch(`${BASE}/production/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine: 'Balaghat', target_mt: 40000, equipment_downtime_hours: 0, rainfall_mm: 0, blasting_delay_hours: 0, maintenance_hours: 0, equipment_availability: 0.95 })
  });
  const pred = await r4.json();
  console.log(`✓ Predict: mine=${pred.mine} risk=${pred.risk} shortfall=${pred.shortfall_percent}%`);

  // Test predict with equipment_availability=0
  const r5 = await fetch(`${BASE}/production/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine: 'Balaghat', target_mt: 40000, equipment_downtime_hours: 45, rainfall_mm: 120, blasting_delay_hours: 12, maintenance_hours: 24, equipment_availability: 0 })
  });
  const pred2 = await r5.json();
  console.log(`✓ Stress test: mine=${pred2.mine} risk=${pred2.risk} shortfall=${pred2.shortfall_percent}%`);

  // Test mines
  const r6 = await fetch(`${BASE}/production/mines`, { headers: { Authorization: `Bearer ${token}` } });
  const mines = await r6.json();
  console.log(`✓ Mines count: ${mines.length}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
