import { pool } from '../src/db';

export async function truncateAll(): Promise<void> {
  await pool.query('TRUNCATE TABLE bookings, resources, users RESTART IDENTITY CASCADE');
}

export async function createTestUser(role: 'customer' | 'admin' = 'customer', email?: string) {
  const userEmail = email || `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, role) 
     VALUES ($1, '$2b$10$dummyHashToSkipBcryptInTests', $2) 
     RETURNING id, email, role`,
    [userEmail, role]
  );
  return res.rows[0];
}

export async function createTestResource(name: string = 'Test Room', type: 'room' | 'equipment' = 'room') {
  const res = await pool.query(
    `INSERT INTO resources (name, type, capacity, active) 
     VALUES ($1, $2, 10, true) 
     RETURNING id, name, type, capacity, active`,
    [name, type]
  );
  return res.rows[0];
}

afterAll(async () => {
  await pool.end();
});
