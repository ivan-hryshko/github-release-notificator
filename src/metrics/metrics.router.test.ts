import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../common/auth.middleware.js', () => ({
  apiKeyAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('./metrics.js', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: vi.fn(() => Promise.resolve('# HELP test\ntest_metric 1\n')),
  },
}));

import express from 'express';
import { metricsRouter } from './metrics.router.js';
import { apiKeyAuth } from '../common/auth.middleware.js';

function buildApp() {
  const app = express();
  app.use(metricsRouter);
  return app;
}

describe('metricsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns metrics with correct content type', async () => {
    const app = buildApp();

    const res = await fetch(await startServer(app, '/metrics'));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(text).toContain('test_metric 1');
  });

  it('invokes apiKeyAuth middleware', async () => {
    const app = buildApp();

    await fetch(await startServer(app, '/metrics'));

    expect(apiKeyAuth).toHaveBeenCalled();
  });
});

async function startServer(app: express.Express, path: string): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(`http://localhost:${port}${path}`);
      setTimeout(() => server.close(), 500);
    });
  });
}
