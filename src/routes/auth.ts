import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db';
import { config } from '../config';
import { validateBody } from '../middleware/validate';
import { authenticateJwt } from '../middleware/auth';
import { BadRequestError } from '../middleware/errorHandler';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.enum(['customer', 'admin']).default('customer'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Register
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { email, password, role } = req.body;

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw new BadRequestError('User with this email already exists');
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const result = await query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, role, created_at`,
        [email, passwordHash, role]
      );

      const user = result.rows[0];

      const token = jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN as any }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Login
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { email, password } = req.body;

    try {
      const result = await query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1',
        [email]
      );

      if (result.rowCount === 0) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

      if (!match) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      const token = jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN as any }
      );

      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get current user profile
router.get('/me', authenticateJwt, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
