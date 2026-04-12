# TODO — GitHub Release Notificator

## Phase 1: Project Setup

- [x] Init project: package.json, tsconfig.json, .nvmrc (Node 20)
- [x] ESLint config with code quality rules (max-lines 300, max-lines-per-function 50, max-depth 4, complexity 10)
- [x] Pino logger setup
- [x] Config: env.ts with Zod validation (optional SMTP/API_KEY/GITHUB_TOKEN for dev)
- [x] Database config: Drizzle + pg pool
- [x] DB schema: users, repositories, subscriptions, scan_jobs, notifications
- [x] Drizzle-kit: generate migrations
- [x] Migration runner (runs on service startup)
- [x] Express app setup: middleware, error handler, async handler wrapper
- [x] Custom error classes (AppError, NotFoundError, ConflictError, ValidationError)
- [x] Dockerfile (multi-stage build)
- [x] docker-compose.yml (grn-app, grn-postgres, grn-redis — ports 80:3000, DB/Redis hidden)
- [x] docker-compose.dev.yml (grn-postgres-dev, grn-redis-dev — exposed ports for local dev)
- [x] .env.example + .gitignore
- [x] Redis client with graceful degradation
- [x] Vitest config
- [x] Verify: server starts, migrations run, health check works, lint passes

## Phase 2: Core API

- [x] Token utility (crypto.randomUUID) — done in Phase 1
- [x] GitHub client: validate repo existence, fetch releases, rate limit handling (429, X-RateLimit headers)
- [x] Subscription validator (Zod: email format, repo regex, token UUID)
- [x] Subscription repository (Drizzle: upsert user/repo, find/create/update subscriptions, join queries)
- [x] Subscription service (subscribe, confirm, unsubscribe, list + re-subscribe after unsub, pending resend)
- [x] Subscription router (POST /subscribe, GET /confirm/:token, /unsubscribe/:token, /subscriptions)
- [x] Notifier service: email sending via Nodemailer (graceful skip if SMTP not configured)
- [x] Email templates: confirmation + release notification
- [x] Swagger served at GET /api/swagger.yaml
- [x] Manual testing: all endpoints verified (400, 404, 409, 200, re-subscribe, unsubscribe)

## Phase 3: Scanner + Notifications

- [x] Scanner service: fetch releases list, compare with last_seen_tag, detect all missed releases
- [x] Scanner cron (node-cron): scheduling + mutex to prevent overlap
- [x] Notification creation: scanner creates 'pending' notification records per subscriber per release
- [x] Notifier cron (every minute): process pending notifications, send emails, update status
- [x] Notifier retry: re-attempt failed notifications (max 3 attempts)
- [x] Email templates: release notification (with unsubscribe link) — done in Phase 2
- [x] Notification deduplication: prevent duplicate notification for same subscription + release_tag
- [ ] E2E manual test: subscribe → confirm → scan → notifications created → email sent

## Phase 4: Testing + CI

- [x] Unit tests: subscription.service (new sub, duplicate, re-subscribe, invalid input, repo not found)
- [x] Unit tests: scanner.service (new release, multiple releases, no new, GitHub failure, dedup)
- [x] Unit tests: notifier.service (send success, SMTP failure)
- [x] Unit tests: notifier.cron (process pending, send success/failure, mixed batch, template rendering)
- [x] Unit tests: notifier.templates (confirmation email, release notification email)
- [x] Unit tests: github.client (success, 404, 429 retry, auth header, rate limit)
- [x] GitHub Actions CI: lint + unit tests on push/PR

## Phase 5: Extras

### Priority extras (do first)
- [x] Redis caching layer: GitHub API responses with configurable TTL (GITHUB_CACHE_TTL, default 600s)
- [x] Redis: ETag/If-None-Match support for conditional requests (304 returns cached body)
- [x] API key authentication: X-API-Key header on POST /subscribe and GET /subscriptions
- [x] HTML subscription page: public/index.html served by Express
  - [ ] possibility pass full github repo
- [x] Deploy on DigitalOcean: Droplet + docker-compose + firewall (22, 80)

### Lower priority extras (if time permits)
- [ ] Prometheus metrics: /metrics endpoint (prom-client)
- [x] Integration tests (testcontainers: Postgres + Redis, full flow)
- [x] GitHub Actions CI: add integration tests
- [ ] gRPC interface as alternative/addition to REST API

## AI Review #001 — Issues (prioritized)

### Critical / Major
- [x] #6 Fix scanner cron crash when DB is down — `updateScanJob(job.id)` throws TypeError if `createScanJob()` fails (`job` is undefined). Guard catch block with `if (job)`.
- [x] #2 Add HTML escaping to email templates — `releaseName`, `releaseUrl` etc. interpolated raw into HTML. Add `escapeHtml()` utility.
- [x] #4 Fix `fetchLatestRelease` filtering bug — `per_page=1` + draft/prerelease filter can return empty, causing false "new release" notifications. Use `/releases/latest` endpoint or higher `perPage`.
- [x] #1 Use constant-time comparison for API key — `provided !== env.API_KEY` vulnerable to timing attacks. Use `crypto.timingSafeEqual`.

### Minor
- [x] #8 Add retry limit to 429 recursion in GitHub client — no max retries, persistent 429s cause infinite recursion. Add counter with max 3.
- [x] #9 Handle subscription creation race condition — concurrent requests for same email+repo hit unique constraint -> 500. Catch Postgres error `23505` and return 409.
- [ ] #5 Document or fix scanner dropping >30 new releases — `findNewReleases` returns only newest when `lastSeenTag` not in list. Add pagination or document as known limitation.
- [ ] #3 Move confirmation email to notification pipeline — currently sent inline in router with no retry. Route through pending -> cron -> send like release notifications.
- [ ] #7 Improve Redis `getRedis()` connection failure handling — race condition if `connect()` rejects after returning instance. Add connection status check.

### Nit
- [ ] #12 Implement Prometheus `/metrics` or remove `prom-client` — dependency in package.json but never imported.
- [ ] #13 Use validated `env.PORT` in Swagger host override — `src/app.ts` reads `process.env.PORT` directly, bypassing Zod.
- [ ] #11 Check `sendEmail` return value for confirmation email — user gets 200 "check your email" even if send failed.
- [ ] #10 Fix SQL interpolation in integration test helper — `getToken()` interpolates column name directly into SQL string.

## Final

- [ ] README.md: architecture description, design decisions, setup instructions
- [ ] Final review: check all Swagger contract compliance
  - [ ] Fix pass API key
- [ ] Final deploy + production testing
