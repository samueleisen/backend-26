import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticateJwt } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { bookingsCreatedTotal } from '../metrics/registry';
import { AppError, NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler';

const router = Router();

const createBookingSchema = z
  .object({
    resource_id: z.string().uuid('Invalid resource UUID'),
    start: z.string().datetime({ message: 'Start time must be ISO-8601' }),
    end: z.string().datetime({ message: 'End time must be ISO-8601' }),
  })
  .refine((data) => new Date(data.end) > new Date(data.start), {
    message: 'End time must be after start time',
    path: ['end'],
  })
  .refine((data) => new Date(data.start) > new Date(), {
    message: 'Booking start time must be in the future',
    path: ['start'],
  })
  .refine(
    (data) => {
      const durationMs = new Date(data.end).getTime() - new Date(data.start).getTime();
      const maxDurationMs = 24 * 60 * 60 * 1000; // 24 hours
      return durationMs <= maxDurationMs;
    },
    {
      message: 'Booking duration cannot exceed 24 hours',
      path: ['end'],
    }
  );

// ==========================================
// STAR ENDPOINT: POST /api/bookings
// Atomically reserves a resource using PostgreSQL GiST range exclusion
// ==========================================
router.post(
  '/',
  authenticateJwt,
  validateBody(createBookingSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { resource_id, start, end } = req.body;

    try {
      // 1. Check resource existence and active status
      const resCheck = await query('SELECT id, active FROM resources WHERE id = $1', [resource_id]);

      if (resCheck.rowCount === 0) {
        throw new NotFoundError('Resource not found');
      }

      if (!resCheck.rows[0].active) {
        throw new BadRequestError('Cannot book an inactive resource');
      }

      // 2. Insert inside database transaction
      // GiST exclusion constraint on (resource_id, during) guarantees zero double bookings
      const newBooking = await withTransaction(async (client) => {
        const sql = `
          INSERT INTO bookings (user_id, resource_id, during, status)
          VALUES ($1, $2, tstzrange($3, $4, '[)'), 'CONFIRMED')
          RETURNING 
            id, 
            user_id, 
            resource_id, 
            lower(during) AS start, 
            upper(during) AS end, 
            status, 
            created_at;
        `;
        const result = await client.query(sql, [userId, resource_id, start, end]);
        return result.rows[0];
      });

      // 3. Increment Prometheus business metric counter
      bookingsCreatedTotal.inc();

      res.status(201).json({
        message: 'Booking confirmed successfully',
        data: newBooking,
      });
    } catch (err: any) {
      // 23P01 (exclusion_violation) will be caught by errorHandler and mapped to 409 Conflict
      next(err);
    }
  }
);

// Get bookings for logged-in user
router.get('/', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  try {
    const sql = `
      SELECT 
        b.id, 
        b.user_id,
        b.resource_id, 
        r.name AS resource_name, 
        r.type AS resource_type,
        lower(b.during) AS start, 
        upper(b.during) AS end, 
        b.status, 
        b.created_at
      FROM bookings b
      JOIN resources r ON r.id = b.resource_id
      ${isAdmin ? '' : 'WHERE b.user_id = $1'}
      ORDER BY lower(b.during) DESC;
    `;

    const params = isAdmin ? [] : [userId];
    const result = await query(sql, params);

    res.json({ bookings: result.rows });
  } catch (err) {
    next(err);
  }
});

// Cancel a booking (releases slot because GiST partial index only indexes CONFIRMED)
router.delete('/:id', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  try {
    const bookingCheck = await query('SELECT id, user_id, status FROM bookings WHERE id = $1', [id]);

    if (bookingCheck.rowCount === 0) {
      throw new NotFoundError('Booking not found');
    }

    const booking = bookingCheck.rows[0];

    // Ownership check
    if (booking.user_id !== userId && !isAdmin) {
      throw new ForbiddenError('You can only cancel your own bookings');
    }

    if (booking.status === 'CANCELLED') {
      res.status(200).json({ message: 'Booking was already cancelled', id });
      return;
    }

    await query("UPDATE bookings SET status = 'CANCELLED' WHERE id = $1", [id]);

    res.status(200).json({
      message: 'Booking cancelled successfully. Slot is now available.',
      id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
