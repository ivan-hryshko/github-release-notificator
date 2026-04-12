import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }

  const provided = req.headers['x-api-key'];

  if (!provided || typeof provided !== 'string' || !safeEqual(provided, env.API_KEY)) {
    res.status(401).json({ message: 'Invalid or missing API key' });
    return;
  }

  next();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
