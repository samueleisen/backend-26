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
