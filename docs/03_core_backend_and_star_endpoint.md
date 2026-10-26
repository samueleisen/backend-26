# Phase 03: Core Backend & The Star Endpoint

This document details the Express.js implementation, JWT authentication, role-based authorization, resource management, and the **Star Endpoint** (`POST /api/bookings`) with PostgreSQL exclusion violation mapping (`23P01` $\rightarrow$ `409 Conflict`).

---

## 1. Authentication & Security Layer

### Password Security & Token Issuance
* **Password Hashing**: Bcrypt with salt rounds = 10.
* **Token Structure**: JSON Web Token signed with `JWT_SECRET`:
  ```json
  {
    "sub": "b2f6b8c4-42b8-4d51-a9f5-1a83b4b60001",
    "email": "user@example.com",
    "role": "customer",
    "iat": 1700000000,
    "exp": 1700086400
  }
  ```

### Auth Middleware (`src/middleware/auth.ts`)
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  role: 'customer' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as any;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

export function requireRole(role: 'admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden', message: `Requires ${role} privileges` });
      return;
    }
    next();
  };
}
```

---

## 2. Global Error Handling & Postgres Error Translation (`src/middleware/errorHandler.ts`)

A central error handler ensures consistent JSON error responses and maps PostgreSQL error codes directly into correct HTTP status codes:

```typescript
import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';
import { bookingConflictsTotal } from '../metrics/registry';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource is already booked during this time range') {
    super(409, message);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. PostgreSQL 23P01 (exclusion_violation)
  if (err.code === '23P01') {
    bookingConflictsTotal.inc();
    res.status(409).json({
      error: 'Conflict',
      message: 'Resource is already booked during this time range',
      code: 'EXCLUSION_VIOLATION',
    });
    return;
  }

  // 2. Custom App Errors (Validation, NotFound, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  // 3. Fallback unhandled error
  console.error('Unhandled internal error:', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected internal error occurred',
  });
}
```

---

## 3. The Star Endpoint: `POST /api/bookings`

### Input Validation Rules (Zod)
```typescript
import { z } from 'zod';

export const createBookingSchema = z.object({
  resource_id: z.string().uuid('Invalid resource UUID'),
  start: z.string().datetime({ message: 'Start time must be ISO-8601' }),
  end: z.string().datetime({ message: 'End time must be ISO-8601' }),
}).refine((data) => new Date(data.end) > new Date(data.start), {
  message: 'End time must be after start time',
  path: ['end'],
}).refine((data) => new Date(data.start) > new Date(), {
  message: 'Booking start time must be in the future',
  path: ['start'],
}).refine((data) => {
  const durationMs = new Date(data.end).getTime() - new Date(data.start).getTime();
  const maxDurationMs = 24 * 60 * 60 * 1000; // 24 hours max
  return durationMs <= maxDurationMs;
}, {
  message: 'Booking duration cannot exceed 24 hours',
  path: ['end'],
});
```

### Route Handler & Controller
```typescript
import { Request, Response, NextFunction } from 'express';
import { query, withTransaction } from '../db';
import { bookingsCreatedTotal } from '../metrics/registry';
import { AppError, ConflictError } from '../middleware/errorHandler';

export async function createBookingHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user!.id;
  const { resource_id, start, end } = req.body;

  try {
    // 1. Verify resource exists and is active
    const resourceCheck = await query(
      'SELECT id, active FROM resources WHERE id = $1',
      [resource_id]
    );

    if (resourceCheck.rowCount === 0) {
      throw new AppError(404, 'Resource not found');
    }

    if (!resourceCheck.rows[0].active) {
      throw new AppError(400, 'Cannot book an inactive resource');
    }

    // 2. Insert inside database transaction
    // Overlap prevention is enforced by the GiST exclusion constraint on (resource_id, during)
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
    next(err);
  }
}
```

---

## 4. Supporting Endpoints

### 1. `GET /api/resources/:id/availability?from=&to=`
Returns all confirmed booked intervals between the requested range using PostgreSQL range intersection (`&&`):

```typescript
export async function getAvailabilityHandler(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  const { from, to } = req.query;

  try {
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
      from,
      to,
      booked_ranges: result.rows,
    });
  } catch (err) {
    next(err);
  }
}
```

### 2. `GET /api/bookings`
Returns current authenticated user's bookings with joined resource name and type:
```sql
SELECT 
  b.id, 
  b.resource_id, 
  r.name AS resource_name, 
  r.type AS resource_type,
  lower(b.during) AS start, 
  upper(b.during) AS end, 
  b.status, 
  b.created_at
FROM bookings b
JOIN resources r ON r.id = b.resource_id
WHERE b.user_id = $1
ORDER BY lower(b.during) DESC;
```

### 3. `DELETE /api/bookings/:id` (Cancellation)
* Verifies booking exists.
* Enforces ownership: `booking.user_id === req.user.id || req.user.role === 'admin'`.
* Updates status: `UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`.
* **Database Effect**: Because the exclusion constraint specifies `WHERE (status = 'CONFIRMED')`, changing status to `'CANCELLED'` removes the entry from the partial GiST index, **instantly freeing the slot** for future bookings.
