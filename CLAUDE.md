# CLAUDE.md — Project Conventions

## Project Overview

GitHub Release Notificator — monolith API (Express + TypeScript) for subscribing to email notifications about new GitHub repository releases. SE School 6.0 test task.

## Stack

- Node.js + TypeScript
- Express.js (thin framework, NestJS forbidden)
- PostgreSQL + Drizzle ORM
- Redis (ioredis) for caching
- Nodemailer + Mailtrap for emails
- node-cron for scheduled jobs
- Vitest for testing
- Pino for logging
- prom-client for Prometheus metrics
- Zod for validation

## Commands

```bash
npm run dev          # Start dev server (tsx src/server.ts)
npm run build        # Compile TypeScript (tsc)
npm start            # Run compiled app (node dist/server.js)
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm test             # Run unit tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
```

## Project Structure

Feature-based architecture. Each module has: router → service → repository.

```
src/
├── app.ts              # Express setup
├── server.ts           # Entry point (start server, run migrations, start crons)
├── config/             # env.ts (Zod-validated), database.ts (Drizzle pool)
├── db/                 # schema.ts (all tables), migrate.ts, migrations/
├── subscription/       # API endpoints (subscribe, confirm, unsubscribe, list)
├── scanner/            # Cron: check GitHub for new releases
├── notifier/           # Cron: send pending email notifications
├── github/             # GitHub API client + Redis cache layer
├── common/             # Errors, middleware (auth, error-handler), utils (token, logger, redis)
├── metrics/            # Prometheus /metrics
└── public/             # Static HTML page
```

## Database Tables

5 tables: `users`, `repositories`, `subscriptions`, `scan_jobs`, `notifications`.
Schema defined in `src/db/schema.ts` (single file — few tables, no need to split).

## Key Patterns

- **Error handling:** Custom error classes (AppError, NotFoundError, ConflictError, ValidationError) thrown in services, caught by global error handler middleware.
- **Async routes:** All route handlers wrapped in asyncHandler to forward rejected promises to error handler.
- **Tokens:** crypto.randomUUID() for confirm/unsubscribe tokens.
- **Scanner mutex:** `isScanning` flag prevents overlapping scan runs.
- **Notification flow:** Scanner creates `pending` notification records → Notifier cron processes them → retry failed up to 3 times.
- **GitHub rate limiting:** Track X-RateLimit-Remaining header, pause if low, handle 429 with Retry-After.

## ESLint Rules (Code Quality)

These rules are enforced as warnings. If a file or function hits these limits, refactor by extracting logic to a separate file — do NOT suppress the warning.

```json
{
  "max-lines": ["warn", { "max": 300, "skipBlankLines": true, "skipComments": true }],
  "max-lines-per-function": ["warn", { "max": 50, "skipBlankLines": true, "skipComments": true, "IIFEs": true }],
  "max-depth": ["warn", 4],
  "complexity": ["warn", 10]
}
```

## Swagger Contract

API contract is defined in `docs/api.yaml` — **do not modify**. All endpoints must match this spec exactly.

## Testing

- Unit tests are mandatory for all services (subscription, scanner, notifier, github client).
- Test files live next to the source: `subscription.service.test.ts`.
- Mock external dependencies (DB, GitHub API, SMTP) in unit tests.
- Use Vitest.

## Docker

- `docker-compose.yml` — production: app (port 80:3000) + postgres + redis (DB/Redis ports hidden)
- `docker-compose.dev.yml` — dev: postgres (5432) + redis (6379) with exposed ports
- App runs on port 3000 internally, mapped to 80 in production.

## Design Documents

- `docs/sdd.md` — System Design Document. When making changes to architecture, data flows, DB schema, infrastructure, or error handling, update the SDD to reflect the current state.

## Important Constraints

- Monolith only — no microservices.
- Express only — no NestJS, no Fastify (unless we decide to switch).
- Swagger contracts cannot be changed.
- GitHub PAT token recommended (5000 req/hr vs 60 without).
