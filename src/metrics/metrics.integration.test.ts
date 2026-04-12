import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../app.js';
import { pool } from '../config/database.js';
import { runMigrations } from '../db/migrate.js';
import { register } from './metrics.js';
import type { Server } from 'node:http';

const PORT = 4001;
let server: Server;

async function authedRequest(path: string) {
  return fetch(`http://localhost:${PORT}${path}`, {
    headers: { 'X-API-Key': process.env.API_KEY ?? '' },
  });
}

describe('GET /metrics', () => {
  beforeAll(async () => {
    register.resetMetrics();
    await runMigrations();
    server = app.listen(PORT);
  });

  afterAll(async () => {
    server.close();
    await pool.end();
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
