import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config } from '../src/config';
import { pool } from '../src/db';
import { truncateAll, createTestUser, createTestResource } from './setup';

describe('Concurrency & GiST Exclusion Tests', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('handles 10 parallel overlapping booking requests: exactly 1 succeeds and 9 return 409 Conflict', async () => {
    const user = await createTestUser();
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.JWT_SECRET);
    const resource = await createTestResource('High Demand Auditorium');

    // Future booking window: Tomorrow 10:00 to 11:00 UTC
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(10, 0, 0, 0);

    const endTime = new Date(tomorrow);
    endTime.setUTCHours(11, 0, 0, 0);

    const payload = {
      resource_id: resource.id,
      start: tomorrow.toISOString(),
      end: endTime.toISOString(),
    };

    // Fire 10 parallel HTTP requests simultaneously
    const CONCURRENT_REQUESTS = 10;
    const promises = Array.from({ length: CONCURRENT_REQUESTS }, () =>
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
    );

    const responses = await Promise.all(promises);

    const successResponses = responses.filter((r) => r.status === 201);
    const conflictResponses = responses.filter((r) => r.status === 409);

    // Assert that the database exclusion constraint allowed exactly ONE booking
    expect(successResponses.length).toBe(1);
    expect(conflictResponses.length).toBe(CONCURRENT_REQUESTS - 1);

    // Verify error format on all rejected requests
    conflictResponses.forEach((res) => {
      expect(res.body.code).toBe('EXCLUSION_VIOLATION');
      expect(res.body.message).toMatch(/already booked/i);
    });

    // Check database state directly: exactly one confirmed record exists
    const dbCheck = await pool.query(
      "SELECT count(*) FROM bookings WHERE resource_id = $1 AND status = 'CONFIRMED'",
      [resource.id]
    );
    expect(parseInt(dbCheck.rows[0].count, 10)).toBe(1);
  });

  it('allows adjacent ranges: Booking A ends at 11:00 and Booking B starts at 11:00', async () => {
    const user = await createTestUser();
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.JWT_SECRET);
    const resource = await createTestResource('Studio B');

    const base = new Date();
    base.setDate(base.getDate() + 1);

    const slot1Start = new Date(base);
    slot1Start.setUTCHours(10, 0, 0, 0);
    const slot1End = new Date(base);
    slot1End.setUTCHours(11, 0, 0, 0);

    const slot2Start = new Date(base);
    slot2Start.setUTCHours(11, 0, 0, 0); // Exact boundary
    const slot2End = new Date(base);
    slot2End.setUTCHours(12, 0, 0, 0);

    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resource_id: resource.id,
        start: slot1Start.toISOString(),
        end: slot1End.toISOString(),
      });

    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resource_id: resource.id,
        start: slot2Start.toISOString(),
        end: slot2End.toISOString(),
      });

    // Both must succeed because tstzrange '[)' is half-open (exclusive upper bound)
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('allows re-booking a cancelled time slot', async () => {
    const user = await createTestUser();
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.JWT_SECRET);
    const resource = await createTestResource('Laboratory 1');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(14, 0, 0, 0);

    const endTime = new Date(tomorrow);
    endTime.setUTCHours(15, 0, 0, 0);

    const bookingPayload = {
      resource_id: resource.id,
      start: tomorrow.toISOString(),
      end: endTime.toISOString(),
    };

    // 1. Initial booking
    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send(bookingPayload);
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id;

    // 2. Cancel booking
    const deleteRes = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // 3. New booking for the same time slot succeeds because partial index indexes only status = 'CONFIRMED'
    const rebookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send(bookingPayload);
    expect(rebookRes.status).toBe(201);
  });
});
