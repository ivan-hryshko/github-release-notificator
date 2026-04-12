import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { register } from './metrics.js';
import express from 'express';
import { metricsMiddleware } from './metrics.middleware.js';
import { metricsRouter } from './metrics.router.js';
import type { Server } from 'node:http';

const PORT = 4001;
let server: Server;

function buildTestApp() {
  const testApp = express();
  testApp.use(metricsMiddleware);
  testApp.get('/health', (_req, res) => res.json({ status: 'ok' }));
  testApp.use(metricsRouter);
  return testApp;
}

async function authedRequest(path: string) {
  return fetch(`http://localhost:${PORT}${path}`, {
    headers: { 'X-API-Key': process.env.API_KEY ?? '' },
  });
}

describe('GET /metrics', () => {
  beforeAll(() => {
    register.resetMetrics();
    server = buildTestApp().listen(PORT);
  });

  afterAll(() => {
    server.close();
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`http://localhost:${PORT}/metrics`);
    expect(res.status).toBe(401);
  });

  it('returns Prometheus text format with API key', async () => {
    const res = await authedRequest('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const body = await res.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  it('contains custom metrics', async () => {
    const res = await authedRequest('/metrics');
    const body = await res.text();

    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('github_rate_limit_remaining');
    expect(body).toContain('emails_sent_total');
    expect(body).toContain('scan_runs_total');
  });

  it('contains default Node.js metrics', async () => {
    const res = await authedRequest('/metrics');
    const body = await res.text();

    expect(body).toContain('process_cpu_seconds_total');
    expect(body).toContain('nodejs_heap_size_total_bytes');
  });

  it('increments http_requests_total after requests', async () => {
    // Make a request to /health to generate a metric
    await fetch(`http://localhost:${PORT}/health`);

    const res = await authedRequest('/metrics');
    const body = await res.text();

    // Should have recorded the /health request
    expect(body).toMatch(/http_requests_total\{.*path="\/health".*\}/);
  });
});
