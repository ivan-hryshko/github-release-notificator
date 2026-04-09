# TODO — GitHub Release Notificator

## Phase 1: Project Setup

- [ ] Init project: package.json, tsconfig.json
- [ ] ESLint config with code quality rules:
  - max-lines: 300 (warn)
  - max-lines-per-function: 50 (warn)
  - max-depth: 4 (warn)
  - complexity: 10 (warn)
  - If a file/function hits these limits — refactor by extracting logic to a separate file
- [ ] Pino logger setup
- [ ] Config: env.ts with Zod validation
- [ ] Database config: Drizzle + pg pool
- [ ] DB schema: users, repositories, subscriptions, scan_jobs, notifications
- [ ] Drizzle-kit: generate migrations
- [ ] Migration runner (runs on service startup)
- [ ] Express app setup: middleware, error handler, async handler wrapper
- [ ] Custom error classes (AppError, NotFoundError, ConflictError, ValidationError)
- [ ] Dockerfile (multi-stage build)
- [ ] docker-compose.yml (app + postgres + redis, ports 80:3000, hide DB/Redis ports)
- [ ] docker-compose.dev.yml (postgres + redis with exposed ports for local dev)
- [ ] .env.example
- [ ] Verify: `docker-compose up` → server starts, migrations run

## Phase 2: Core API

- [ ] Token utility (crypto.randomUUID)
- [ ] GitHub client (basic, no cache): validate repo existence, fetch releases
- [ ] GitHub client: rate limit handling (track X-RateLimit-Remaining/Reset, handle 429)
- [ ] Subscription validator (Zod: email format, repo regex)
- [ ] Subscription repository (DB queries via Drizzle)
- [ ] Subscription service (business logic: subscribe, confirm, unsubscribe, list)
  - Handle: new sub, duplicate (409), re-subscribe after unsubscribe, pending resend
- [ ] Subscription router (POST /subscribe, GET /confirm/:token, /unsubscribe/:token, /subscriptions)
- [ ] Notifier service: basic email sending via Nodemailer + Mailtrap
- [ ] Email templates: confirmation email
- [ ] Prepare Swagger (api.yaml) for testing — serve via endpoint or static file
- [ ] Manual testing: all 4 endpoints with curl/Postman

## Phase 3: Scanner + Notifications

- [ ] Scanner service: fetch releases list, compare with last_seen_tag, detect all missed releases
- [ ] Scanner cron (node-cron): scheduling + mutex to prevent overlap
- [ ] Notification creation: scanner creates 'pending' notification records per subscriber per release
- [ ] Notifier cron (every minute): process pending notifications, send emails, update status
- [ ] Notifier retry: re-attempt failed notifications (max 3 attempts)
- [ ] Email templates: release notification (with unsubscribe link)
- [ ] Notification deduplication: prevent duplicate notification for same subscription + release_tag
- [ ] E2E manual test: subscribe → confirm → scan → notifications created → email sent

## Phase 4: Testing + CI

- [ ] Unit tests: subscription.service (new sub, duplicate, re-subscribe, invalid input, repo not found)
- [ ] Unit tests: scanner.service (new release, multiple releases, no new, GitHub failure)
- [ ] Unit tests: notifier.service (send success, SMTP failure, retry)
- [ ] Unit tests: github.client (success, 404, 429 retry, cache hit/miss)
- [ ] GitHub Actions CI: lint + unit tests on push/PR

## Phase 5: Extras

### Priority extras (do first)
- [ ] Redis caching layer: GitHub API responses with TTL 10 min
- [ ] Redis: ETag/If-None-Match support for conditional requests
- [ ] Redis: graceful degradation (skip cache if Redis down)
- [ ] API key authentication: X-API-Key header middleware on /api/*
- [ ] HTML subscription page: public/index.html served by Express
- [ ] Deploy on DigitalOcean: Droplet + docker-compose + firewall (22, 80)

### Lower priority extras (if time permits)
- [ ] Prometheus metrics: /metrics endpoint (prom-client)
  - Counters: http_requests_total, subscriptions_created, emails_sent/failed, github_api_calls, scan_runs
  - Gauges: active_subscriptions, tracked_repositories, github_rate_limit_remaining, pending_notifications
  - Histograms: http_request_duration, scan_duration, email_send_duration
- [ ] Integration tests (testcontainers: Postgres + Redis, full flow)
- [ ] GitHub Actions CI: add integration tests
- [ ] gRPC interface as alternative/addition to REST API

## Final

- [ ] README.md: architecture description, design decisions, setup instructions
- [ ] Final review: check all Swagger contract compliance
- [ ] Final deploy + production testing
