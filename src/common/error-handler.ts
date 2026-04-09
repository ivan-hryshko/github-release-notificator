import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errors.js';
import { logger } from './logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal server error' });
}
