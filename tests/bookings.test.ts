import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config } from '../src/config';
import { pool } from '../src/db';
import { truncateAll, createTestUser, createTestResource } from './setup';

describe('Bookings Integration Tests', () => {
  let customerToken: string;
  let customerId: string;
  let otherCustomerToken: string;
  let resourceId: string;

  beforeEach(async () => {
    await truncateAll();
    const customer = await createTestUser('customer');
    customerId = customer.id;
    const otherCustomer = await createTestUser('customer');

    customerToken = jwt.sign({ sub: customer.id, email: customer.email, role: customer.role }, config.JWT_SECRET);
    otherCustomerToken = jwt.sign(
      { sub: otherCustomer.id, email: otherCustomer.email, role: otherCustomer.role },
      config.JWT_SECRET
    );

    const resource = await createTestResource('Conference Room 101');
    resourceId = resource.id;
  });

  describe('Validation & Edge Cases', () => {
    it('rejects booking in the past', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 1800000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start: pastStart,
          end: pastEnd,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects booking where end is before start', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const start = new Date(tomorrow.getTime() + 3600000).toISOString();
      const end = tomorrow.toISOString(); // end is earlier than start

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start,
          end,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects bookings exceeding 24 hours maximum duration', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const start = tomorrow.toISOString();
      const end = new Date(tomorrow.getTime() + 25 * 3600000).toISOString(); // 25 hours

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start,
          end,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 404 if resource does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const tomorrow = new Date(Date.now() + 86400000);
      const start = tomorrow.toISOString();
      const end = new Date(tomorrow.getTime() + 3600000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: fakeId,
          start,
          end,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFoundError');
    });

    it('returns 400 if resource is inactive', async () => {
      const inactiveRes = await pool.query(
        "INSERT INTO resources (name, type, active) VALUES ('Broken Projector', 'equipment', false) RETURNING id"
      );
      const tomorrow = new Date(Date.now() + 86400000);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: inactiveRes.rows[0].id,
          start: tomorrow.toISOString(),
          end: new Date(tomorrow.getTime() + 3600000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/inactive/i);
    });
  });

  describe('Booking Lifecycle & Ownership', () => {
    it('creates a confirmed booking and retrieves it via GET /api/bookings', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const start = tomorrow.toISOString();
      const end = new Date(tomorrow.getTime() + 3600000).toISOString();

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start,
          end,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('CONFIRMED');

      const listRes = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.bookings.length).toBe(1);
      expect(listRes.body.bookings[0].resource_name).toBe('Conference Room 101');
    });

    it('forbids other customers from cancelling bookings they do not own', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start: tomorrow.toISOString(),
          end: new Date(tomorrow.getTime() + 3600000).toISOString(),
        });

      const bookingId = createRes.body.data.id;

      // Attempt cancellation by different user
      const cancelRes = await request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(cancelRes.status).toBe(403);
      expect(cancelRes.body.error).toBe('ForbiddenError');
    });

    it('allows owner to cancel their own booking', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resourceId,
          start: tomorrow.toISOString(),
          end: new Date(tomorrow.getTime() + 3600000).toISOString(),
        });

      const bookingId = createRes.body.data.id;

      const cancelRes = await request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.message).toMatch(/cancelled successfully/i);
    });
  });
});
