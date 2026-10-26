# Resource Booking API & Platform — Architecture & Master Roadmap

This document serves as the chronological roadmap and architectural specification for building the **Resource Booking Platform** (Rooms & Equipment). It fulfills the technical and CV requirements, the DevOps and runtime constraints in [`sum-devop.md`](./sum-devop.md), and the domain architecture defined in [`star-domainscope.md`](./star-domainscope.md).


---

## 1. System Overview & Architectural Narrative

The platform is designed to demonstrate **deep backend and database concurrency control** coupled with **production-grade DevOps observability**:

```
                       +---------------------------------------+
                       |           Frontend (React SPA)        |
                       |  Resources | Availability | Bookings  |
                       +-------------------+-------------------+
                                           | HTTP / JSON (JWT)
                                           v
+-----------------------------------------------------------------------------------+
| Node.js / Express Backend (TypeScript)                                            |
|                                                                                   |
|  +------------------------+  +-----------------------+  +----------------------+  |
|  | /health (Gatus Contract) |  | /metrics (Prometheus) |  | /api/auth & resources|  |
|  +------------------------+  +-----------------------+  +----------------------+  |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | STAR ENDPOINT: POST /api/bookings                                           |  |
|  | * Input validation (start < end, future dates, max duration)                |  |
|  | * Atomically writes to PostgreSQL                                           |  |
|  | * Catches exclusion violations (error 23P01) -> 409 Conflict                |  |
|  | * Increments bookings_created_total or booking_conflicts_total metrics      |  |
|  +-----------------------------------------------------------------------------+  |
|                                      |                                            |
|                                      v Connection Pool (pg.Pool)                  |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| PostgreSQL 16+ Database                                                           |
|                                                                                   |
|  * Extension: btree_gist                                                          |
|  * bookings table with `during tstzrange`                                         |
|  * GiST Exclusion Constraint:                                                     |
|      EXCLUDE USING gist (resource_id WITH =, during WITH &&)                      |
|      WHERE (status = 'CONFIRMED')                                                 |
|  * Guarantees zero double-bookings under high concurrency at the storage engine    |
+-----------------------------------------------------------------------------------+
```

---

## 2. Chronological Action Phases

All project implementation steps are broken down into sequential, orderly phases in this `docs/` directory:

| Phase | Document | Description |
| :---: | :--- | :--- |
| **01** | [`01_environment_and_scaffolding.md`](./01_environment_and_scaffolding.md) | Project initialization, TypeScript setup, Dockerized Postgres, 12-factor configuration, `.env.example`. |
| **02** | [`02_database_schema_and_migrations.md`](./02_database_schema_and_migrations.md) | `node-pg-migrate` setup, `btree_gist`, tables (`users`, `resources`, `bookings`), range exclusion constraints. |
| **03** | [`03_core_backend_and_star_endpoint.md`](./03_core_backend_and_star_endpoint.md) | Express app, JWT auth, RBAC, Star endpoint `POST /api/bookings`, cancellation, 23P01 error handling. |
| **04** | [`04_observability_and_devops_contract.md`](./04_observability_and_devops_contract.md) | `/health` Gatus contract (`SELECT 1`), `/metrics` Prometheus histograms, custom business counters, `SIGTERM`. |
| **05** | [`05_automated_testing_and_concurrency.md`](./05_automated_testing_and_concurrency.md) | Jest + Supertest suite: parallel booking race condition tests, boundary tests, cancellation tests. |
| **06** | [`06_frontend_client_and_integration.md`](./06_frontend_client_and_integration.md) | Minimal React client: resource list, availability viewer, booking form, user dashboard. |
| **07** | [`07_deployment_and_cv_verification.md`](./07_deployment_and_cv_verification.md) | Google Cloud Run deployment, Gatus/Prometheus wiring, real performance metrics, and CV bullet drafting. |

---

## 3. Definition of Done (DoD)

The project is considered complete when all of the following criteria are validated:

1. **Database Rigor**:
   - PostgreSQL schema uses `btree_gist` and `tstzrange`.
   - Double-bookings are physically impossible at the database level due to `EXCLUDE USING gist`.
   - Migrations can execute up and down reliably via `npm run migrate:up` and `npm run migrate:down`.
2. **Star Endpoint**:
   - `POST /api/bookings` validates input ranges and returns `201 Created` on success.
   - Any overlapping attempt returns `409 Conflict` with a clean JSON payload `{ "error": "Conflict", "message": "Resource is already booked during this time range" }`.
3. **Observability & DevOps Contract**:
   - `GET /health` runs an active `SELECT 1` on the database pool, returning `200 OK` with `{"status":"ok","database":"ok"}` under 500ms.
   - `GET /metrics` outputs Prometheus exposition format containing process metrics, `http_requests_total`, `http_request_duration_seconds`, and custom business counters (`bookings_created_total`, `booking_conflicts_total`).
   - Server handles `SIGTERM` with graceful connection draining under 10 seconds.
4. **Test Quality**:
   - Jest integration test suite executes automated concurrency tests firing parallel overlapping bookings and verifies that exactly 1 succeeds and all concurrent duplicates receive 409.
   - Code coverage is tracked and reported.
5. **Code & Repository Quality**:
   - Zero secrets committed (`.env` in `.gitignore`, `.env.example` committed).
   - Strict TypeScript compilation with zero errors.
   - Production multi-stage `Dockerfile` targeting Google Cloud Run.
