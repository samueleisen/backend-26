import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
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
