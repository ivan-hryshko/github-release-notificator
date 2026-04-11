import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }

  const provided = req.headers['x-api-key'];

  if (!provided || provided !== env.API_KEY) {
    res.status(401).json({ message: 'Invalid or missing API key' });
    return;
  }

  next();
}
