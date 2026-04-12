import { describe, it, expect, beforeEach } from 'vitest';
import { register, httpRequestsTotal, httpRequestDuration, githubRateLimitRemaining, emailsSentTotal, scanRunsTotal } from './metrics.js';

describe('metrics registry', () => {
  beforeEach(async () => {
    (await register.getMetricsAsJSON()).forEach(() => {});
    httpRequestsTotal.reset();
    httpRequestDuration.reset();
    githubRateLimitRemaining.reset();
    emailsSentTotal.reset();
    scanRunsTotal.reset();
  });

  it('returns metrics in Prometheus text format', async () => {
    const output = await register.metrics();
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
  });

  it('registers all custom metrics', async () => {
    const output = await register.metrics();
    expect(output).toContain('http_requests_total');
    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('github_rate_limit_remaining');
    expect(output).toContain('emails_sent_total');
    expect(output).toContain('scan_runs_total');
  });

  it('includes default Node.js metrics', async () => {
    const output = await register.metrics();
    expect(output).toContain('process_cpu_seconds_total');
    expect(output).toContain('nodejs_heap_size_total_bytes');
  });

  it('increments counter with labels', async () => {
    emailsSentTotal.inc({ status: 'sent' });
    emailsSentTotal.inc({ status: 'sent' });
    emailsSentTotal.inc({ status: 'failed' });

    const output = await register.metrics();
    expect(output).toContain('emails_sent_total{status="sent"} 2');
    expect(output).toContain('emails_sent_total{status="failed"} 1');
  });

  it('sets gauge value', async () => {
    githubRateLimitRemaining.set(4500);

    const output = await register.metrics();
    expect(output).toContain('github_rate_limit_remaining 4500');
  });
});
