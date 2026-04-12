import type { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration } from './metrics.js';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePath(req: Request): string {
  const parts = req.path.split('/');

  const normalized = parts.map((part) =>
    TOKEN_PATTERN.test(part) ? ':token' : part,
  );

  return normalized.join('/');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const path = normalizePath(req);
    const method = req.method;
    const status = String(res.statusCode);

    httpRequestsTotal.inc({ method, path, status });
    end({ method, path });
  });

  next();
}
