import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config } from '../src/config';
import { truncateAll, createTestUser, createTestResource } from './setup';

describe('Resources Integration Tests', () => {
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    await truncateAll();
    const admin = await createTestUser('admin');
    const customer = await createTestUser('customer');

    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, config.JWT_SECRET);
    customerToken = jwt.sign({ sub: customer.id, email: customer.email, role: customer.role }, config.JWT_SECRET);
  });

  describe('GET /api/resources', () => {
    it('returns list of active resources publicly without auth', async () => {
      await createTestResource('Conference Room 1', 'room');
      await createTestResource('Projector A', 'equipment');

      const res = await request(app).get('/api/resources');

      expect(res.status).toBe(200);
      expect(res.body.resources.length).toBe(2);
      expect(res.body.resources[0]).toHaveProperty('name');
    });
  });

  describe('POST /api/resources (Admin Only)', () => {
    it('allows admin to create a new room resource', async () => {
      const res = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Executive Boardroom',
          type: 'room',
          capacity: 20,
          active: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.resource).toMatchObject({
        name: 'Executive Boardroom',
        type: 'room',
        capacity: 20,
      });
    });

    it('forbids customer from creating resources with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Illegal Room',
          type: 'room',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('rejects invalid resource type with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Type Item',
          type: 'vehicle', // Only 'room' or 'equipment'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });
  });

  describe('GET /api/resources/:id/availability', () => {
    it('returns booked ranges for resource within queried window', async () => {
      const resource = await createTestResource('Studio A', 'room');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(10, 0, 0, 0);

      const endTime = new Date(tomorrow);
      endTime.setUTCHours(12, 0, 0, 0);

      // Book the room
      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          resource_id: resource.id,
          start: tomorrow.toISOString(),
          end: endTime.toISOString(),
        });

      // Query availability covering this range
      const queryFrom = new Date(tomorrow);
      queryFrom.setUTCHours(0, 0, 0, 0);
      const queryTo = new Date(tomorrow);
      queryTo.setUTCHours(23, 59, 59, 0);

      const res = await request(app).get(
        `/api/resources/${resource.id}/availability?from=${queryFrom.toISOString()}&to=${queryTo.toISOString()}`
      );

      expect(res.status).toBe(200);
      expect(res.body.booked_ranges.length).toBe(1);
      expect(new Date(res.body.booked_ranges[0].start).toISOString()).toBe(tomorrow.toISOString());
    });

    it('returns 404 if resource does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 86400000).toISOString();

      const res = await request(app).get(
        `/api/resources/${fakeId}/availability?from=${from}&to=${to}`
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFoundError');
    });
  });
});
