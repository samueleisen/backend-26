import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';

async function runVerification() {
  console.log('🧪 Starting Phase 03 End-to-End Verification...\n');

  // Clear tables
  await pool.query('TRUNCATE TABLE bookings, resources, users RESTART IDENTITY CASCADE');

  // 1. Register customer
  console.log('1. Testing User Registration...');
  const regUser = await request(app)
    .post('/api/auth/register')
    .send({ email: 'alice@example.com', password: 'password123', role: 'customer' });
  if (regUser.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regUser.body)}`);
  const userToken = regUser.body.token;
  console.log('   ✅ Customer registered. JWT issued.');

  // 2. Register admin
  console.log('2. Testing Admin Registration...');
  const regAdmin = await request(app)
    .post('/api/auth/register')
    .send({ email: 'admin@example.com', password: 'adminpassword123', role: 'admin' });
  if (regAdmin.status !== 201) throw new Error(`Admin registration failed: ${JSON.stringify(regAdmin.body)}`);
  const adminToken = regAdmin.body.token;
  console.log('   ✅ Admin registered. JWT issued.');

  // 3. Admin creates resource
  console.log('3. Testing Admin Resource Creation...');
  const createRes = await request(app)
    .post('/api/resources')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Boardroom Alpha', type: 'room', capacity: 16 });
  if (createRes.status !== 201) throw new Error(`Resource creation failed: ${JSON.stringify(createRes.body)}`);
  const resourceId = createRes.body.resource.id;
  console.log(`   ✅ Resource created (ID: ${resourceId}).`);

  // 4. Non-admin forbidden from creating resource
  console.log('4. Testing Role Guard (Customer forbidden from resource creation)...');
  const forbiddenRes = await request(app)
    .post('/api/resources')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'Unauthorized Room', type: 'room' });
  if (forbiddenRes.status !== 403) throw new Error('Customer should be forbidden from creating resources');
  console.log('   ✅ HTTP 403 Forbidden correctly returned.');

  // 5. Star Endpoint: Create Booking 1 (Tomorrow 10:00 to 11:00 UTC)
  console.log('5. Testing Star Endpoint: Initial Booking Creation...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(10, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setUTCHours(11, 0, 0, 0);

  const booking1Res = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      resource_id: resourceId,
      start: tomorrow.toISOString(),
      end: endTime.toISOString(),
    });
  if (booking1Res.status !== 201) throw new Error(`Booking 1 failed: ${JSON.stringify(booking1Res.body)}`);
  const booking1Id = booking1Res.body.data.id;
  console.log('   ✅ Booking 1 confirmed (HTTP 201).');

  // 6. Star Endpoint: Overlapping Booking 2 (Tomorrow 10:30 to 11:30 UTC) -> Conflict
  console.log('6. Testing Star Endpoint: Overlapping Booking Conflict Rejection...');
  const overlapStart = new Date(tomorrow);
  overlapStart.setUTCHours(10, 30, 0, 0);
  const overlapEnd = new Date(tomorrow);
  overlapEnd.setUTCHours(11, 30, 0, 0);

  const booking2Res = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      resource_id: resourceId,
      start: overlapStart.toISOString(),
      end: overlapEnd.toISOString(),
    });

  if (booking2Res.status !== 409) {
    throw new Error(`Expected 409 Conflict, received ${booking2Res.status}: ${JSON.stringify(booking2Res.body)}`);
  }
  if (booking2Res.body.code !== 'EXCLUSION_VIOLATION') {
    throw new Error(`Expected code EXCLUSION_VIOLATION, received ${booking2Res.body.code}`);
  }
  console.log('   ✅ Overlap caught! Returned HTTP 409 Conflict with code EXCLUSION_VIOLATION.');

  // 7. Check availability endpoint
  console.log('7. Testing Availability Query Endpoint...');
  const queryFrom = new Date(tomorrow);
  queryFrom.setUTCHours(0, 0, 0, 0);
  const queryTo = new Date(tomorrow);
  queryTo.setUTCHours(23, 59, 59, 0);

  const availRes = await request(app)
    .get(`/api/resources/${resourceId}/availability?from=${queryFrom.toISOString()}&to=${queryTo.toISOString()}`);
  if (availRes.status !== 200 || availRes.body.booked_ranges.length !== 1) {
    throw new Error(`Availability query unexpected: ${JSON.stringify(availRes.body)}`);
  }
  console.log('   ✅ Availability correctly returned 1 booked range.');

  // 8. Cancel booking 1
  console.log('8. Testing Booking Cancellation & Slot Recovery...');
  const cancelRes = await request(app)
    .delete(`/api/bookings/${booking1Id}`)
    .set('Authorization', `Bearer ${userToken}`);
  if (cancelRes.status !== 200) throw new Error(`Cancellation failed: ${JSON.stringify(cancelRes.body)}`);
  console.log('   ✅ Booking 1 cancelled.');

  // 9. Re-booking the previously occupied slot now succeeds!
  console.log('9. Testing Re-booking the Cancelled Slot...');
  const rebookRes = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      resource_id: resourceId,
      start: tomorrow.toISOString(),
      end: endTime.toISOString(),
    });
  if (rebookRes.status !== 201) throw new Error(`Re-booking failed: ${JSON.stringify(rebookRes.body)}`);
  console.log('   ✅ Re-booking succeeded (HTTP 201). Slot was freed by cancellation.');

  // 10. Check /health endpoint
  console.log('10. Testing Gatus Contract (/health)...');
  const healthRes = await request(app).get('/health');
  if (healthRes.status !== 200 || healthRes.body.status !== 'ok' || healthRes.body.database !== 'ok') {
    throw new Error(`Health check failed: ${JSON.stringify(healthRes.body)}`);
  }
  console.log(`   ✅ /health returned 200 OK (${healthRes.body.latency_ms}ms).`);

  // 11. Check /metrics endpoint
  console.log('11. Testing Prometheus Contract (/metrics)...');
  const metricsRes = await request(app).get('/metrics');
  if (metricsRes.status !== 200) throw new Error('Metrics endpoint failed');
  if (!metricsRes.text.includes('bookings_created_total') || !metricsRes.text.includes('booking_conflicts_total')) {
    throw new Error('Business metrics missing from Prometheus output');
  }
  console.log('   ✅ /metrics verified. Custom business counters present in exposition format.');

  console.log('\n🎉 ALL PHASE 03 VERIFICATIONS PASSED SUCCESSFULLY!');
  await pool.end();
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  pool.end().then(() => process.exit(1));
});
