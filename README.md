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

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/subscribe | Subscribe email to repo release notifications |
| GET | /api/confirm/:token | Confirm email subscription |
| GET | /api/unsubscribe/:token | Unsubscribe from notifications |
| GET | /api/subscriptions?email= | List active subscriptions for email |

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

## Develop logic steps
1. Requirment analysis
- [RFC-001: Requirements Analysis & Technology Choices](docs/rfc/RFC-001-requirements-and-stack.md)
2. Start build basic setup
  - test it and with Claude
3. Add basic endpoints
  - cover them with unit tests
  - add git basic ci - it helps as at development
4. Add Scaner and Notifier logic
  - it more complex logic so i alos added integration tests
  - [ADR-001: Switch to MailHog for local dev](docs/adr/ADR-001-mailhog-for-local-development.md) — Claude couldn't verify emails via Mailtrap's web UI, so switched to MailHog with REST API access
5. Refined email UI for better user experience
6. Implemented a basic UI for API integration. Acknowledging the time constraints for a polished UX, I’ve decided to prioritize deployment first
  - Done is better than perfect: a deployed site beats an undeployed ideal

