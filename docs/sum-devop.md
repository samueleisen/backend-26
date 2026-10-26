# Backend Integration Contract

A minimal reference for the backend service integrating with this DevOps stack and Google Cloud Run.

---

### 1. HTTP Endpoints to Implement

| Endpoint | Method | Format | Expected Response | Consumed By |
| :--- | :--- | :--- | :--- | :--- |
| **`/health`** | `GET` | JSON | **HTTP 200** `{"status":"ok","database":"ok"}` (<500ms) | **Gatus** (every 30s) |
| **`/metrics`** | `GET` | Plaintext | Prometheus exposition format (`text/plain`) | **Prometheus** (every 15s) |

#### Required metrics on `/metrics`:
* `http_requests_total{method, route, status_code}` (Counter)
* `http_request_duration_seconds` (Histogram)
* Default runtime process metrics (CPU seconds, memory RSS)

---

### 2. Runtime & Container Rules

* **Network binding:** Listen on `0.0.0.0:${PORT:-8080}` (never bind only to `localhost`).
* **Logging:** Stream all logs strictly to `stdout`/`stderr` (never write to container log files).
* **Graceful shutdown:** Handle `SIGTERM` to drain requests and close DB pools cleanly within 10s.
* **Stateless:** Do not rely on local filesystem storage (ephemeral on Cloud Run).

---

### 3. Environment & Configuration

* **Strictly 12-Factor:** Read all settings (e.g. `DATABASE_URL`, `PORT`) from environment variables.
* **Zero secrets in Git:** Commit a clean `.env.example` with dummy values; ensure `.env` is in `.gitignore`.

---

### 4. DevOps Stack Wiring

* **Gatus ([gatus/config.yaml](file:///home/sam/Code/DevOps-26/gatus/config.yaml)):**
  Points to `http://backend:8080/health`. If it fails 3 times, it triggers an automated GitHub incident issue.
* **Prometheus ([prometheus/prometheus.yml](file:///home/sam/Code/DevOps-26/prometheus/prometheus.yml)):**
  Scrapes `http://backend:8080/metrics` every 15s under job `backend-service`.
