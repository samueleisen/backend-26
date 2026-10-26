import path from 'path';
import fs from 'fs';
import express, { Application, Request, Response, NextFunction } from 'express';
import { metricsMiddleware } from './middleware/metrics';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import metricsRouter from './routes/metrics';
import authRouter from './routes/auth';
import resourcesRouter from './routes/resources';
import bookingsRouter from './routes/bookings';


export const app: Application = express();

// Basic security / CORS headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// JSON body parser
app.use(express.json());

// Prometheus metrics interceptor
app.use(metricsMiddleware);

// Observability endpoints
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);

// Domain API routes
app.use('/api/auth', authRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/bookings', bookingsRouter);

// Static frontend serving if built
const frontendDist = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/metrics') {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Root API info fallback
  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: 'resource-booking-api',
      status: 'running',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        auth: '/api/auth',
        resources: '/api/resources',
        bookings: '/api/bookings',
      },
    });
  });
}


// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global Central Error Handler
app.use(errorHandler);
