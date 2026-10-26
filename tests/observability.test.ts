import request from 'supertest';
import { app } from '../src/app';

describe('Observability & DevOps Contract Tests', () => {
  describe('GET /health (Gatus Contract)', () => {
    it('returns 200 OK with {"status":"ok","database":"ok"} within 500ms', async () => {
      const start = Date.now();
      const res = await request(app).get('/health');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        database: 'ok',
      });
      expect(elapsed).toBeLessThan(500);
      expect(res.body.latency_ms).toBeDefined();
    });
  });

  describe('GET /metrics (Prometheus Contract)', () => {
    it('exposes metrics in Prometheus format with required business and HTTP counters', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);

      // Verify required metric names
      expect(res.text).toContain('nodejs_version_info');
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('http_request_duration_seconds');
      expect(res.text).toContain('bookings_created_total');
      expect(res.text).toContain('booking_conflicts_total');
    });
  });

  describe('404 Fallback', () => {
    it('returns 404 for unmapped routes', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
    });
  });
});
