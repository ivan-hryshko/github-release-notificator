# ADR-006: Prometheus Metrics Endpoint

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-12

---

## Context

As the system scales toward 10,000+ users, we need observability to detect issues before they affect users — slow scans, email delivery failures, GitHub API rate limit exhaustion. Without metrics, the only way to know something is broken is when users complain or when we manually check logs.

## Decision

We use **prom-client** (already a dependency) to expose a `GET /metrics` endpoint in Prometheus text format. The endpoint is protected by the same `X-API-KEY` authentication used for admin endpoints ([ADR-002](ADR-002-api-key-auth.md)).

### Metrics (Phase 1 — High Priority)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `http_requests_total` | Counter | method, path, status | Traffic patterns, error rates |
| `http_request_duration_seconds` | Histogram | method, path | Latency monitoring |
| `github_rate_limit_remaining` | Gauge | — | Early warning before API blindness |
| `emails_sent_total` | Counter | status (sent/failed) | Email delivery health |
| `scan_runs_total` | Counter | status (completed/failed) | Cron job reliability |

Default Node.js metrics (memory, CPU, event loop) are also collected via `collectDefaultMetrics()`.

### Design Choices

- **In-memory only**: Metrics are accumulated in process memory. The `/metrics` endpoint does not query the database — it simply serializes current counter/gauge values. This means zero DB overhead per Prometheus scrape.
- **Path normalization**: Dynamic UUID segments in HTTP paths are replaced with `:token` to prevent cardinality explosion (e.g., `/api/confirm/550e8400-...` → `/api/confirm/:token`).
- **API key protection**: Metrics expose operational data (request counts, error rates, rate limits) that could aid targeted attacks. Reusing the existing API key is consistent and simple.

## Consequences

- **Prometheus configuration**: When deploying Prometheus, it must send the `X-API-KEY` header during scraping.
- **Memory**: Negligible — prom-client stores counters and histograms as numeric values in memory.
- **Future expansion**: Additional metrics (subscriptions gauge, pending notifications gauge, scan duration histogram) can be added incrementally without architectural changes.

## Security: Shared API Key Trade-off

The `/metrics` endpoint reuses the same `API_KEY` that protects admin endpoints and is shared with API consumers. This is an acceptable trade-off for the current MVP/test task scope, but would be a security concern in production:

- **No identity separation**: We cannot distinguish who is scraping metrics — a Prometheus instance, an admin, or an external consumer. If the key leaks, metrics data (request counts, error rates, GitHub rate limit status) becomes visible to attackers.
- **No granular revocation**: Revoking the key for one party means revoking it for everyone.

**Production recommendation**: Separate the metrics endpoint onto an internal-only port (e.g., `:9090`) that is not exposed outside the Docker network, or introduce per-service API keys with distinct scopes (`admin`, `metrics`, `consumer`). This removes the need for Prometheus to authenticate at all — it simply scrapes from within the private network.
