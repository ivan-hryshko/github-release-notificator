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

## Logic steps
1. Requirment analysis
  - Planing do tasks in pair with Claude
  - Thinking about deployment method
    - I want make addional task, so Heroku is not an options
    - Looks like Digital Ocean will be better solution, easier to deploy with docker-compose file
  - Choose stack
    - Express
    - Postgress - good choise in most cases, for test task perfect
    - I want work with Claude so i choose Drizzle ORM
  - Think about draft solution and also genereta draft plan with claude for some corner cases maybe i lost sometning