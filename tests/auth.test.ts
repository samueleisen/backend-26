import request from 'supertest';
import { app } from '../src/app';
import { truncateAll } from './setup';

describe('Auth Integration Tests', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'password123',
          role: 'customer',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        email: 'user@example.com',
        role: 'customer',
      });
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('rejects duplicate email registration with 400 Bad Request', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'duplicate@example.com', password: 'password123' });

      const duplicateRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'duplicate@example.com', password: 'newpassword123' });

      expect(duplicateRes.status).toBe(400);
      expect(duplicateRes.body.message).toMatch(/already exists/i);
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'loginuser@example.com', password: 'correctpassword', role: 'customer' });
    });

    it('authenticates valid credentials and returns a JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'loginuser@example.com', password: 'correctpassword' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('loginuser@example.com');
    });

    it('rejects invalid password with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'loginuser@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('rejects non-existent email with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'anypassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user payload when valid Bearer token is provided', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'me@example.com', password: 'password123', role: 'admin' });

      const token = registerRes.body.token;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toMatchObject({
        email: 'me@example.com',
        role: 'admin',
      });
    });

    it('returns 401 Unauthorized when token is missing', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
