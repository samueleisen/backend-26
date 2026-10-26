# Phase 01: Environment, Scaffolding & Tooling

This document outlines the step-by-step setup of the project foundation, TypeScript compilation environment, 12-factor configuration, and local development database.

---

## 1. Directory Structure

The project follows a clean, layered architecture separating routing, controllers, database queries, and middleware:

```
backend-26/
├── .env.example                # 12-Factor dummy config committed to git
├── .gitignore                  # Excludes node_modules, .env, dist, coverage
├── docker-compose.yml          # Local PostgreSQL 16 service for dev and testing
├── Dockerfile                  # Multi-stage production container for Cloud Run
├── package.json
├── tsconfig.json
├── migrations/                 # Managed by node-pg-migrate
│   └── 001_initial_schema.sql (or .ts)
├── src/
│   ├── config.ts               # 12-Factor validated environment loader
│   ├── db.ts                   # pg.Pool singleton and query helpers
│   ├── app.ts                  # Express application setup and middleware
│   ├── server.ts               # HTTP listener and SIGTERM graceful shutdown
│   ├── middleware/
│   │   ├── auth.ts             # JWT extraction, verification, and role guards
│   │   ├── metrics.ts          # Prometheus request timer and counter middleware
│   │   ├── validation.ts       # Zod schema request validation helper
│   │   └── errorHandler.ts     # Global error-to-JSON mapper (including Postgres 23P01)
│   ├── metrics/
│   │   └── registry.ts         # prom-client instance and business metric counters
│   ├── routes/
│   │   ├── health.ts           # /health endpoint with active DB ping
│   │   ├── metrics.ts          # /metrics exposition endpoint
│   │   ├── auth.ts             # /api/auth routes
│   │   ├── resources.ts        # /api/resources routes
│   │   └── bookings.ts         # /api/bookings Star Endpoint routes
│   └── services/
│       ├── authService.ts
│       ├── resourceService.ts
│       └── bookingService.ts
└── tests/
    ├── setup.ts                # DB truncation / test fixture helper
    ├── auth.test.ts            # Authentication flow integration tests
    ├── resources.test.ts       # Resource CRUD integration tests
    ├── bookings.test.ts        # Single-booking and boundary integration tests
    └── concurrency.test.ts     # Parallel conflict tests asserting exclusion locks
```

---

## 2. Dependencies & Package Setup

### `package.json` Specification

```json
{
  "name": "resource-booking-api",
  "version": "1.0.0",
  "description": "Resource booking backend with PostgreSQL GiST exclusion locks and Prometheus telemetry",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create",
    "test": "jest --runInBand --detectOpenHandles --forceExit",
    "test:coverage": "jest --runInBand --coverage"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "jsonwebtoken": "^9.0.2",
    "node-pg-migrate": "^7.6.1",
    "pg": "^8.13.1",
    "prom-client": "^15.1.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.17.0",
    "@types/pg": "^8.11.10",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3"
  }
}
```

---

## 3. TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "migrations"]
}
```

---

## 4. 12-Factor Environment & Secrets Policy

### `.env.example` (Committed to Git)
```env
# Server
PORT=8080
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgres://booking_user:booking_password@localhost:5432/booking_db
DATABASE_POOL_MAX=20
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONN_TIMEOUT_MS=5000

# Authentication
JWT_SECRET=replace_with_a_secure_random_string_in_production
JWT_EXPIRES_IN=24h
```

### `.gitignore`
```gitignore
node_modules/
dist/
coverage/
.env
*.log
.DS_Store
```

---

## 5. Local Database Container (`docker-compose.yml`)

A PostgreSQL 16 container pre-configured with the credentials matching `.env.example`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: booking_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: booking_user
      POSTGRES_PASSWORD: booking_password
      POSTGRES_DB: booking_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U booking_user -d booking_db"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## 6. Environment Validation Module (`src/config.ts`)

To adhere to the 12-factor pattern and fail fast on boot if an environment variable is missing or malformed:

```typescript
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8080').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  DATABASE_POOL_MAX: z.string().default('20').transform((val) => parseInt(val, 10)),
  DATABASE_IDLE_TIMEOUT_MS: z.string().default('30000').transform((val) => parseInt(val, 10)),
  DATABASE_CONN_TIMEOUT_MS: z.string().default('5000').transform((val) => parseInt(val, 10)),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('24h'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
```
