# Phase 02: Database Schema & GiST Exclusion Migrations

This document details the PostgreSQL schema, the mathematical and relational rationale behind `tstzrange` and `GiST` exclusion constraints, the migration files via `node-pg-migrate`, and the connection pool configuration.

---

## 1. Deep Dive: Why PostgreSQL Range Types & GiST?

In typical naive applications, developers attempt to prevent overlapping bookings at the application layer:
```sql
-- NAIVE APPROACH (Vulnerable to race conditions):
SELECT COUNT(*) FROM bookings 
WHERE resource_id = $1 
  AND status = 'CONFIRMED'
  AND (start_time < $3 AND end_time > $2);

-- If count == 0, insert booking:
INSERT INTO bookings ...
```
**Why this fails in production**: Under concurrent requests (e.g., 20 users booking the same room at the exact same millisecond across multiple Cloud Run container instances), both requests read `COUNT(*) = 0` simultaneously before either has written. Both proceed to insert, causing a **double-booking bug**.

Even `SELECT ... FOR UPDATE` requires locking a parent row or serializable transactions, which degrades database throughput.

### The PostgreSQL Solution: GiST Range Exclusion Constraint

PostgreSQL supports native **Range Types** (`tstzrange` — timestamp with time zone range) and **Generalized Search Trees (GiST)**:

1. **Range Operator `&&` (Overlaps)**: Determines if two intervals intersect:
   $$\text{Range}_A \cap \text{Range}_B \neq \emptyset$$
2. **`btree_gist` Extension**: Allows scalar equality (`=`) on UUIDs/integers to be indexed inside a GiST index alongside range types.
3. **Partial Exclusion Constraint**:
   ```sql
   EXCLUDE USING gist (
       resource_id WITH =,
       during WITH &&
   ) WHERE (status = 'CONFIRMED')
   ```
   * **`resource_id WITH =`**: Matches bookings for the identical resource.
   * **`during WITH &&`**: Detects if the time intervals overlap.
   * **`WHERE (status = 'CONFIRMED')`**: Partial index filter. When a user cancels a booking, its status becomes `'CANCELLED'`, immediately removing it from the exclusion check so the time slot becomes open again.

If a concurrent query attempts to insert an overlapping range, the database engine halts the insert and raises standard PostgreSQL error:
$$\mathbf{23P01} \quad (\text{exclusion\_violation})$$

---

## 2. Migration Files (`node-pg-migrate`)

### Migration: `migrations/1700000000000_initial-schema.js` (or `.ts`)

```javascript
/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Enable btree_gist extension for combining scalar equality with range overlap
  pgm.createExtension('btree_gist', { ifNotExists: true });

  // 2. Users Table
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    role: {
      type: 'varchar(20)',
      notNull: true,
      default: 'customer',
      check: "role IN ('customer', 'admin')",
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // 3. Resources Table (Rooms & Equipment)
  pgm.createTable('resources', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    type: {
      type: 'varchar(50)',
      notNull: true,
      check: "type IN ('room', 'equipment')",
    },
    capacity: {
      type: 'integer',
      notNull: false,
    },
    active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // 4. Bookings Table
  pgm.createTable('bookings', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    resource_id: {
      type: 'uuid',
      notNull: true,
      references: 'resources(id)',
      onDelete: 'RESTRICT',
    },
    during: {
      type: 'tstzrange',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'CONFIRMED',
      check: "status IN ('CONFIRMED', 'CANCELLED')",
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // 5. Exclusion Constraint: Overlap Prevention at Database Level
  pgm.addConstraint('bookings', 'no_overlapping_confirmed_bookings', {
    exclude: 'USING gist (resource_id WITH =, during WITH &&) WHERE (status = \'CONFIRMED\')',
  });

  // 6. Performance Indexes
  pgm.createIndex('bookings', 'user_id');
  pgm.createIndex('bookings', 'resource_id');
  pgm.createIndex('resources', 'active');
};

exports.down = (pgm) => {
  pgm.dropTable('bookings');
  pgm.dropTable('resources');
  pgm.dropTable('users');
  pgm.dropExtension('btree_gist');
};
```

---

## 3. Database Connection Pooling (`src/db.ts`)

```typescript
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: config.DATABASE_CONN_TIMEOUT_MS,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

// Helper for single queries
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (config.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

// Transaction execution wrapper
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```
