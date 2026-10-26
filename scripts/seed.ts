import bcrypt from 'bcrypt';
import { pool } from '../src/db';

async function seed() {
  console.log('🌱 Seeding PostgreSQL Database with Demo Data...\n');

  try {
    // 1. Truncate existing data to start fresh
    await pool.query('TRUNCATE TABLE bookings, resources, users RESTART IDENTITY CASCADE;');

    // 2. Hash passwords
    const saltRounds = 10;
    const customerHash = await bcrypt.hash('password123', saltRounds);
    const adminHash = await bcrypt.hash('adminpassword123', saltRounds);

    // 3. Insert Users
    const usersResult = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES
       ('alice@example.com', $1, 'customer'),
       ('bob@example.com', $1, 'customer'),
       ('admin@example.com', $2, 'admin')
       RETURNING id, email, role;`,
      [customerHash, adminHash]
    );

    const alice = usersResult.rows.find((u) => u.email === 'alice@example.com');
    const bob = usersResult.rows.find((u) => u.email === 'bob@example.com');

    console.log('✅ Demo Users Seeded:');
    usersResult.rows.forEach((u) => {
      const pass = u.role === 'admin' ? 'adminpassword123' : 'password123';
      console.log(`   - ${u.email} (${u.role}) | Password: ${pass}`);
    });

    // 4. Insert Resources
    const resourcesResult = await pool.query(
      `INSERT INTO resources (name, type, capacity, active) VALUES
       ('Executive Boardroom Alpha', 'room', 16, true),
       ('Podcast & Streaming Studio', 'room', 4, true),
       ('Agile Huddle Room Beta', 'room', 6, true),
       ('4K Laser Cinema Projector', 'equipment', null, true),
       ('Mobile PA Sound System & Mics', 'equipment', null, true)
       RETURNING id, name, type, capacity;`
    );

    console.log('\n✅ Demo Resources Seeded:');
    resourcesResult.rows.forEach((r) => {
      const capStr = r.capacity ? `(Capacity: ${r.capacity})` : '(Equipment)';
      console.log(`   - [${r.type.toUpperCase()}] ${r.name} ${capStr}`);
    });

    const boardroom = resourcesResult.rows.find((r) => r.name.includes('Boardroom'));
    const studio = resourcesResult.rows.find((r) => r.name.includes('Podcast'));

    // 5. Insert Sample Confirmed Bookings for Tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const slot1Start = new Date(tomorrow);
    slot1Start.setUTCHours(14, 0, 0, 0);
    const slot1End = new Date(tomorrow);
    slot1End.setUTCHours(16, 0, 0, 0);

    const slot2Start = new Date(tomorrow);
    slot2Start.setUTCHours(10, 0, 0, 0);
    const slot2End = new Date(tomorrow);
    slot2End.setUTCHours(12, 0, 0, 0);

    if (boardroom && alice) {
      await pool.query(
        `INSERT INTO bookings (user_id, resource_id, during, status)
         VALUES ($1, $2, tstzrange($3, $4, '[)'), 'CONFIRMED');`,
        [alice.id, boardroom.id, slot1Start.toISOString(), slot1End.toISOString()]
      );
    }

    if (studio && bob) {
      await pool.query(
        `INSERT INTO bookings (user_id, resource_id, during, status)
         VALUES ($1, $2, tstzrange($3, $4, '[)'), 'CONFIRMED');`,
        [bob.id, studio.id, slot2Start.toISOString(), slot2End.toISOString()]
      );
    }

    console.log('\n✅ Sample Bookings Seeded for Tomorrow:');
    console.log(`   - ${boardroom?.name}: 14:00 - 16:00 UTC (Booked by Alice)`);
    console.log(`   - ${studio?.name}: 10:00 - 12:00 UTC (Booked by Bob)`);

    console.log('\n🚀 Database seeding complete! Ready for frontend & API testing.');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
