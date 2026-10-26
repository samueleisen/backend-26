# ResourceFlow — Concurrent Resource Booking Engine & API

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Jest Tests](https://img.shields.io/badge/Tests-28%20Passed-brightgreen.svg)](https://jestjs.io/)
[![Coverage](https://img.shields.io/badge/Coverage-92.3%25-success.svg)](https://jestjs.io/)
[![Prometheus](https://img.shields.io/badge/Metrics-Prometheus-orange.svg)](https://prometheus.io/)

A high-concurrency room and equipment reservation engine engineered to guarantee **zero double-booking race conditions** at the database layer using PostgreSQL **GiST range exclusion constraints**, instrumented with **Prometheus telemetry**, and monitored by **Gatus uptime probes**.

---

## 🏛️ Core Architectural Highlights

### 1. Database-Enforced Concurrency (GiST Exclusion Lock)
Typical backends attempt to prevent double-bookings at the application layer (`SELECT COUNT(*) ... IF 0 INSERT`), which fails under concurrent load across horizontal container instances.

ResourceFlow enforces overlap prevention directly in the storage engine using PostgreSQL **Range Types (`tstzrange`)** and **`btree_gist`**:

```sql
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_confirmed_bookings
EXCLUDE USING gist (
  resource_id WITH =,
  during WITH &&
) WHERE (status = 'CONFIRMED');
```
* **Atomicity**: The storage engine halts overlapping intervals and raises PostgreSQL error **`23P01`** (`exclusion_violation`).
* **Conflict Translation**: The backend intercepts `23P01` and returns standard **HTTP `409 Conflict`** with a typed payload.
* **Instant Slot Recovery**: Because the index is partial (`WHERE status = 'CONFIRMED'`), cancelling a booking updates its status to `CANCELLED` and immediately evicts it from the GiST index, instantly freeing the slot without deleting audit records.

### 2. DevOps & Observability Contracts
* **Gatus SLA Probe (`GET /health`)**: Executes an active `SELECT 1` on the PostgreSQL connection pool. Responds in **~1ms** (SLA: `<500ms`).
* **Prometheus Telemetry (`GET /metrics`)**: Exposes Node.js process metrics, route-level latency histograms (`http_request_duration_seconds`), total request counters, and custom business metrics:
  * `bookings_created_total`
  * `booking_conflicts_total`
* **Graceful `SIGTERM` Draining**: Handles container scaling and terminations within 10 seconds by draining in-flight HTTP requests and closing database pools cleanly.

---

## 📡 API Reference

| Endpoint | Method | Auth | Description |
| :--- | :---: | :---: | :--- |
| **`/health`** | `GET` | Public | Active PostgreSQL probe for Gatus (`{"status":"ok","database":"ok"}`). |
| **`/metrics`** | `GET` | Public | Prometheus exposition format for telemetry scrapers. |
| **`/api/auth/register`** | `POST` | Public | User registration with bcrypt hashing (10 salt rounds). |
| **`/api/auth/login`** | `POST` | Public | Authenticates credentials and issues stateless JWT. |
| **`/api/auth/me`** | `GET` | Bearer | Returns current authenticated user profile and role. |
| **`/api/resources`** | `GET` | Public | Lists all active rooms and equipment. |
| **`/api/resources`** | `POST` | Admin | Creates a new resource (restricted to `admin` role). |
| **`/api/resources/:id/availability`** | `GET` | Public | Queries booked intervals using PostgreSQL range intersection (`&&`). |
| **`POST /api/bookings`** | `POST` | Bearer | **The Star Endpoint**: Atomically reserves a resource; rejects overlaps with `409 Conflict`. |
| **`GET /api/bookings`** | `GET` | Bearer | Lists current user's reservations with resource details. |
| **`DELETE /api/bookings/:id`** | `DELETE` | Bearer | Cancels a reservation (enforces ownership; frees slot). |

---

## ⚡ Quickstart (Local Development)

### 1. Prerequisites
* Node.js v20+ or v22+
* Docker & Docker Compose

### 2. Launch PostgreSQL Container
```bash
docker compose up -d
```

### 3. Install Dependencies & Run Migrations
```bash
npm install
npm run migrate:up
```

### 4. Seed Demo Data
Populates realistic rooms, equipment, and demo user accounts (`alice@example.com`, `bob@example.com`, `admin@example.com`):
```bash
npm run seed
```

### 5. Start the Application
```bash
# Start backend server
npm run dev

# Or in another terminal, launch frontend development server:
npm run client:dev
```
Open **`http://localhost:8080/`** (or `http://localhost:5173/` during Vite development) in your browser.

---

## 🧪 Automated Testing & Concurrency Verification

The test suite runs with **Jest** and **Supertest** against the live PostgreSQL database:

```bash
npm run test:coverage
```

### Test Coverage Results:
* **28 Total Integration Tests** (Auth, Resources, Bookings, Concurrency, Observability).
* **92.3% Code Coverage** across all files.
* **10-Client Parallel Concurrency Test**: Fires 10 simultaneous overlapping requests via `Promise.all` $\rightarrow$ exactly 1 succeeds (`201 Created`), exactly 9 are rejected (`409 Conflict`), verifying zero double-booking race conditions.

---

## 📁 Repository Structure

```
├── .env.example             # 12-Factor dummy configuration
├── Dockerfile               # Multi-stage production container for Cloud Run
├── docker-compose.yml       # Local PostgreSQL 16 container service
├── jest.config.js           # Jest configuration with coverage thresholds
├── migrations/              # node-pg-migrate schema scripts
├── src/
│   ├── app.ts               # Express application & static SPA serving
│   ├── config.ts            # Zod-validated 12-factor environment loader
│   ├── db.ts                # pg.Pool connection pooling & transaction runner
│   ├── server.ts            # HTTP listener & 10s SIGTERM graceful shutdown
│   ├── metrics/             # prom-client registry & custom business counters
│   ├── middleware/          # JWT auth, error handler (23P01 mapper), metrics
│   └── routes/              # Health, metrics, auth, resources, bookings
├── frontend/                # Lightweight React SPA (TypeScript + Vite)
├── tests/                   # Jest + Supertest integration test suites
└── docs/                    # Chronological architectural documentation
```
