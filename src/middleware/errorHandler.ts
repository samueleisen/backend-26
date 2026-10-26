import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { bookingConflictsTotal } from '../metrics/registry';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource is already booked during this time range') {
    super(409, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(400, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. PostgreSQL 23P01 (exclusion_violation)
  if (err && err.code === '23P01') {
    bookingConflictsTotal.inc();
    res.status(409).json({
      error: 'Conflict',
      message: 'Resource is already booked during this time range',
      code: 'EXCLUSION_VIOLATION',
    });
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Request payload validation failed',
      issues: err.errors,
    });
    return;
  }

  // 3. Custom App Errors (Validation, NotFound, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  // 4. Fallback unhandled error (strictly logs to stderr per 12-factor spec)
  console.error('Unhandled internal error:', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected internal error occurred',
  });
}
