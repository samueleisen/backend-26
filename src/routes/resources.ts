import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticateJwt, requireRole } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

const createResourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['room', 'equipment']),
  capacity: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
});

const availabilityQuerySchema = z.object({
  from: z.string().datetime({ message: 'from must be a valid ISO-8601 string' }),
  to: z.string().datetime({ message: 'to must be a valid ISO-8601 string' }),
});

// List all active resources (publicly readable)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      'SELECT id, name, type, capacity, active, created_at FROM resources WHERE active = true ORDER BY name ASC'
    );
    res.json({ resources: result.rows });
  } catch (err) {
    next(err);
  }
});

// Create new resource (Admin only)
router.post(
  '/',
  authenticateJwt,
  requireRole('admin'),
  validateBody(createResourceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, type, capacity, active } = req.body;

    try {
      const result = await query(
        `INSERT INTO resources (name, type, capacity, active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, type, capacity, active, created_at`,
        [name, type, capacity ?? null, active ?? true]
      );
      res.status(201).json({
        message: 'Resource created successfully',
        resource: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get resource availability (booked ranges)
router.get(
  '/:id/availability',
  validateQuery(availabilityQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { from, to } = req.query as { from: string; to: string };

    try {
      // Verify resource exists
      const resCheck = await query('SELECT id, name FROM resources WHERE id = $1', [id]);
      if (resCheck.rowCount === 0) {
        throw new NotFoundError('Resource not found');
      }

      const sql = `
        SELECT 
          id, 
          lower(during) AS start, 
          upper(during) AS end 
        FROM bookings 
        WHERE resource_id = $1 
          AND status = 'CONFIRMED'
          AND during && tstzrange($2, $3, '[)')
        ORDER BY lower(during) ASC;
      `;
      const result = await query(sql, [id, from, to]);

      res.json({
        resource_id: id,
        resource_name: resCheck.rows[0].name,
        from,
        to,
        booked_ranges: result.rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
