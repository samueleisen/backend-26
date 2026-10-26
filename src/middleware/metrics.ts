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
