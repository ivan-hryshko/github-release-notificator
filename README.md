# GitHub Release Notificator

API service that allows users to subscribe to email notifications about new releases of GitHub repositories.

## Tech Stack

- **Runtime:** Node.js + TypeScript (tsx for dev, tsc for prod)
- **Framework:** Express.js
- **Database:** PostgreSQL + Drizzle ORM
- **Cache:** Redis (GitHub API responses, TTL 10 min)
- **Email:** Nodemailer + Mailtrap
- **Scanner:** node-cron (in-process scheduled jobs)
- **Testing:** Vitest
- **CI:** GitHub Actions
- **Deploy:** DigitalOcean Droplet + Docker

## Architecture

Monolith with three modules in a single Node.js process:
- **API** — REST endpoints for subscription management
- **Scanner** — cron job that checks GitHub for new releases
- **Notifier** — cron job that processes pending email notifications

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/ivan-hryshko/github-release-notificator.git
cd github-release-notificator
npm install

# 2. Start infrastructure (Postgres + Redis)
docker-compose -f docker-compose.dev.yml up -d

# 3. Copy env and fill in values
cp .env.example .env

# 4. Run in development
npm run dev

# 5. Or run everything in Docker
docker-compose up --build
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/subscribe | API Key | Subscribe email to repo release notifications |
| GET | /api/confirm/:token | - | Confirm email subscription |
| GET | /api/unsubscribe/:token | - | Unsubscribe from notifications |
| GET | /api/subscriptions?email= | API Key | List active subscriptions for email |

**Authentication:** Set `API_KEY` in `.env` to enable. Pass via `X-API-Key` header. When `API_KEY` is empty, auth is disabled. See [ADR-002](docs/adr/ADR-002-api-key-auth.md).

## Project Structure

```
src/
├── config/          # Environment, database config
├── db/              # Drizzle schema, migrations
├── subscription/    # Subscribe/confirm/unsubscribe API
├── scanner/         # Release checking cron job
├── notifier/        # Email sending cron job
├── github/          # GitHub API client + Redis cache
├── common/          # Errors, middleware, utilities
├── metrics/         # Prometheus /metrics endpoint
└── public/          # Static HTML subscription page
```

## Design Documents

- [RFC-001: Requirements Analysis & Technology Choices](docs/rfc/RFC-001-requirements-and-stack.md)
- [SDD: System Design Document](docs/sdd.md)
- [ADR-001: Switch to MailHog for local dev](docs/adr/ADR-001-mailhog-for-local-development.md)
- [ADR-002: Single Admin API Key](docs/adr/ADR-002-api-key-auth.md)

## Develop logic steps
1. Requirements analysis — [RFC-001](docs/rfc/RFC-001-requirements-and-stack.md)
2. Build basic setup (project structure, config, DB schema, Docker)
   - Pair programming with Claude, testing each step
3. Add API endpoints (subscribe, confirm, unsubscribe, list)
   - Covered with unit tests
   - Added GitHub Actions CI — helps catch issues during development
4. Add Scanner and Notifier background jobs
   - More complex logic, so also added integration tests
   - Switched to MailHog for local dev — [ADR-001](docs/adr/ADR-001-mailhog-for-local-development.md)
5. Refined email templates for better user experience
6. Built HTML subscription page and Redis caching layer (GitHub API)
7. Deploy to DigitalOcean — done is better than perfect
8. Added API key authentication — [ADR-002](docs/adr/ADR-002-api-key-auth.md)

