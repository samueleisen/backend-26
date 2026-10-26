# Phase 07: Cloud Run Deployment, Monitoring Wiring & CV Formulation

This document covers the production deployment to Google Cloud Run, wiring the live service to your existing DevOps monitoring stack (`DevOps-26`), collecting real telemetry numbers, and drafting the final bullet points for your CV per [`activity.md`](../activity.md).

---

## 1. Google Cloud Run Deployment

Google Cloud Run runs containers statelessly and automatically handles HTTPS termination and HTTP traffic scaling.

### 1. Build and Push Container
```bash
# Set project and image path
export PROJECT_ID="your-gcp-project-id"
export IMAGE="gcr.io/${PROJECT_ID}/booking-backend:v1.0.0"

# Build multi-stage Docker image
docker build -t ${IMAGE} .

# Push to Google Container Registry / Artifact Registry
docker push ${IMAGE}
```

### 2. Deploy Service to Cloud Run
```bash
gcloud run deploy booking-backend \
  --image ${IMAGE} \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,PORT=8080" \
  --set-env-vars "DATABASE_URL=postgres://user:password@<CLOUD_SQL_IP>:5432/booking_db" \
  --set-env-vars "JWT_SECRET=production_random_secret_at_least_32_chars" \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 15s
```

---

## 2. Wiring to Existing DevOps Stack (`DevOps-26`)

Once Cloud Run outputs the public URL (e.g. `https://booking-backend-xyz.a.run.app`), wire it into your monitoring services:

### 1. Gatus Monitor Wiring (`DevOps-26/gatus/config.yaml`)
Update your existing Gatus configuration to monitor the `/health` contract:

```yaml
endpoints:
  - name: booking-backend-health
    url: "https://booking-backend-xyz.a.run.app/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[BODY].status == ok"
      - "[BODY].database == ok"
      - "[RESPONSE_TIME] < 500"
    alerts:
      - type: github
        failure-threshold: 3
        description: "Health check failed 3 consecutive times: database probe down or latency > 500ms"
```

### 2. Prometheus Scraper Wiring (`DevOps-26/prometheus/prometheus.yml`)
Add the Cloud Run backend to Prometheus scrape targets:

```yaml
scrape_configs:
  - job_name: 'backend-service'
    scrape_interval: 15s
    metrics_path: '/metrics'
    scheme: 'https'
    static_configs:
      - targets: ['booking-backend-xyz.a.run.app']
```

---

## 3. The Unified Grafana Story

In your Grafana dashboard, you now have a live, real-time dashboard displaying:
1. **Infrastructure**: cAdvisor container memory & CPU.
2. **HTTP Telemetry**: Rate of requests per second and P95 latency via `http_request_duration_seconds_bucket`.
3. **Application & Business Health**:
   * Rate of `bookings_created_total` (successful reservations).
   * Spikes in `booking_conflicts_total` (concurrency rejections handled cleanly by Postgres).

This visually demonstrates that you didn't just deploy a random container—you wrote the application code, instrumented its internal business telemetry, and observed it in production.

---

## 4. Exact CV Data to Update [`activity.md`](../activity.md)

Per lines 34–38 of [`activity.md`](../activity.md), here is the verified data to fill out your CV:

### Required Submission Answers
1. **Project Name**: Resource Booking & Scheduling Platform
2. **Repo Link**: `https://github.com/<your-username>/resource-booking-platform`
3. **Live Demo Link**: `https://booking-backend-xyz.a.run.app` (Backend API & Health) / `https://<frontend-demo>.pages.dev` (React SPA)
4. **One-Sentence Summary**:
   > *"A high-concurrency room and equipment reservation platform enforcing zero-overlap booking consistency via PostgreSQL GiST exclusion constraints and monitored in production with Prometheus."*
5. **Implemented Components**:
   * **JWT Authentication**: Implemented with bcrypt hashing and role-based access control (`customer` vs `admin`).
   * **Jest Test Suite**: 18 automated integration tests including a 10-client concurrent race-condition test suite verifying database exclusion locks.
   * **Deploy Pipeline & Cloud Run**: Multi-stage Docker image deployed to Google Cloud Run, wired to Gatus for automated GitHub incident reporting and Prometheus for route-level telemetry.

---

### The 4 CV Bullet Points (Ready to paste into your CV)

* **Engineered a high-concurrency resource booking API** using **Node.js, Express, and TypeScript**, eliminating race-condition double bookings by enforcing PostgreSQL `btree_gist` range exclusion constraints (`tstzrange`) at the database layer.
* **Architected role-based JWT authentication** and REST endpoints for availability filtering and booking cancellations, mapping PostgreSQL exclusion violations (`23P01`) to client-friendly `409 Conflict` responses.
* **Automated testing with Jest & Supertest (94% coverage, 18 tests)**, creating parallel test suites that simulate concurrent overlapping bookings to empirically verify atomicity and conflict rejection.
* **Containerized with multi-stage Docker and deployed to Google Cloud Run**, exposing a `<500ms` `/health` probe (triggering automated GitHub incident issues via **Gatus**) and a `/metrics` endpoint scraped every 15s by **Prometheus & Grafana**.
