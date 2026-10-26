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
    exclude: "USING gist (resource_id WITH =, during WITH &&) WHERE (status = 'CONFIRMED')",
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
