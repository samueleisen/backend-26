# Phase 04: Observability & DevOps Contract

This document specifies the exact implementation of the **DevOps Integration Contract** defined in [`sum-devop.md`](./sum-devop.md): the `/health` endpoint for Gatus, the `/metrics` endpoint for Prometheus, structured stdout logging, and graceful `SIGTERM` shutdown on Google Cloud Run.


---

## 1. The Gatus Contract: `GET /health`

### Specification
* **Consumer**: Gatus uptime monitor ([`gatus/config.yaml`](../../DevOps-26/gatus/config.yaml)), polling every 30s.
* **Failure Condition**: 3 consecutive failures trigger an automated GitHub incident issue.
* **SLA**: Response time `< 500ms`.
* **Payload**: `{"status":"ok","database":"ok"}`.

### Implementation (`src/routes/health.ts`)
```typescript
import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Actively probe PostgreSQL connectivity
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - startTime;

    if (latencyMs > 500) {
      console.warn(`Health check degraded: DB latency ${latencyMs}ms exceeds 500ms SLA`);
    }

    res.status(200).json({
      status: 'ok',
      database: 'ok',
      latency_ms: latencyMs,
    });
  } catch (err: any) {
    console.error('Health check failed: database probe error', err.message);
    res.status(503).json({
      status: 'error',
      database: 'unreachable',
      error: err.message,
    });
  }
});

export default router;
```

---

## 2. The Prometheus Contract: `GET /metrics`

### Specification
* **Consumer**: Prometheus scraper ([`prometheus/prometheus.yml`](../../DevOps-26/prometheus/prometheus.yml)), scraping every 15s under job `backend-service`.
* **Exposition**: Plaintext format (`text/plain; version=0.0.4`).
* **Metrics required**:
  1. Default Node.js runtime process metrics (CPU seconds, memory RSS, event loop lag).
  2. `http_requests_total{method, route, status_code}`.
  3. `http_request_duration_seconds` (Histogram).
  4. Business metrics: `bookings_created_total`, `booking_conflicts_total`.

### Metrics Registry (`src/metrics/registry.ts`)
```typescript
import client from 'prom-client';

// Enable default runtime metrics collection
client.collectDefaultMetrics({ prefix: 'nodejs_' });

// HTTP request duration histogram
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// HTTP total requests counter
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

// Custom business metrics
export const bookingsCreatedTotal = new client.Counter({
  name: 'bookings_created_total',
  help: 'Total confirmed bookings created in database',
});

export const bookingConflictsTotal = new client.Counter({
  name: 'booking_conflicts_total',
  help: 'Total booking attempts rejected due to GiST exclusion conflict (23P01)',
});

export const registry = client.register;
```

### Metrics Interceptor Middleware (`src/middleware/metrics.ts`)
```typescript
import { Request, Response, NextFunction } from 'express';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../metrics/registry';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Exclude health and metrics endpoints from application traffic telemetry
  if (req.path === '/metrics' || req.path === '/health') {
    next();
    return;
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route?.path || req.baseUrl || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}
```

### Metrics Route (`src/routes/metrics.ts`)
```typescript
import { Router, Request, Response } from 'express';
import { registry } from '../metrics/registry';

const router = Router();

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

export default router;
```

---

## 3. Graceful Shutdown & Cloud Run Lifecycle (`src/server.ts`)

Cloud Run sends a `SIGTERM` when scaling down or deploying a new revision. The container has **10 seconds** to stop accepting new requests, drain existing requests, and close database connections:

```typescript
import http from 'http';
import { app } from './app';
import { config } from './config';
import { pool } from './db';

const server = http.createServer(app);

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on 0.0.0.0:${config.PORT} [env=${config.NODE_ENV}]`);
});

// Graceful shutdown handler
function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Draining connections and shutting down...`);

  const shutdownTimer = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded (10s). Forcing termination.');
    process.exit(1);
  }, 10000);

  server.close(async (err) => {
    if (err) {
      console.error('Error during HTTP server close:', err);
      process.exit(1);
    }

    try {
      console.log('Closing PostgreSQL connection pool...');
      await pool.end();
      console.log('PostgreSQL pool closed cleanly.');
      clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (dbErr) {
      console.error('Error while closing PostgreSQL pool:', dbErr);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## 4. Production Cloud Run Container (`Dockerfile`)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Run as non-root user
USER node

EXPOSE 8080
CMD ["node", "dist/server.js"]
```
