import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const githubRateLimitRemaining = new Gauge({
  name: 'github_rate_limit_remaining',
  help: 'GitHub API rate limit remaining requests',
  registers: [register],
});

export const emailsSentTotal = new Counter({
  name: 'emails_sent_total',
  help: 'Total number of emails sent',
  labelNames: ['status'] as const,
  registers: [register],
});

export const scanRunsTotal = new Counter({
  name: 'scan_runs_total',
  help: 'Total number of scan runs',
  labelNames: ['status'] as const,
  registers: [register],
});
