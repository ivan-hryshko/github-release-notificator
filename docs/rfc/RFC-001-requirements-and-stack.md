# RFC-001: Requirements Analysis & Technology Choices

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-10

---

## 1. Context

SE School 6.0 test task: build an API that lets users subscribe to email notifications about new GitHub repository releases. Deadline: April 12, 2026.

Constraints from the task:
- Monolith only (no microservices)
- Thin framework only (Express/Fastify, no NestJS)
- Must match provided Swagger contract exactly
- Unit tests mandatory, integration tests are a bonus
- Extra points: deploy + HTML page, Redis caching, API key auth, Prometheus metrics, CI pipeline

## 2. Development Approach

I decided to work in pair with Claude (AI assistant) to move fast while keeping quality high. The workflow:

1. **Requirements analysis** — read the task, identify edge cases, draft a plan together with Claude
2. **Build in phases** — foundation first, then API, then background jobs, then extras
3. **Test as you go** — unit tests written alongside each module, not after
4. **Deploy early** — a deployed service beats an undeployed ideal; ship first, polish later

## 3. Technology Choices

| Choice | Why |
|--------|-----|
| **Express.js** | Allowed by task rules. Simple, well-known, fast to set up |
| **TypeScript** | Type safety catches bugs early, better DX with Claude |
| **PostgreSQL** | Reliable for relational data (users, subscriptions, notifications). Perfect for a task like this |
| **Drizzle ORM** | Type-safe queries, lightweight, good migration support. Chose it because it works well with Claude for code generation |
| **Redis** | Caching GitHub API responses (TTL 10 min). Graceful degradation — app works without it |
| **Nodemailer + Mailtrap** | Mailtrap for email delivery. MailHog added for local dev so AI assistant can also verify emails |
| **node-cron** | In-process cron, no external dependencies. Simple mutex prevents overlapping scans |
| **Vitest** | Fast, ESM-native, good mocking support |
| **Pino** | Structured JSON logging, low overhead |

## 4. Deployment Decision

Considered options:
- **Heroku** — limited for extra tasks (no docker-compose, no custom infra)
- **DigitalOcean Droplet** — full control, easy to deploy with docker-compose, $6/month

Chose DigitalOcean because:
- `docker-compose up` deploys the entire stack (app + Postgres + Redis)
- Port mapping `80:3000` — user accesses `http://<ip>` without specifying port
- DB and Redis ports hidden from outside (only accessible within Docker network)
- Firewall: only ports 22 (SSH) and 80 (HTTP) open
- No Nginx needed — Express serves both API and static HTML page via `express.static()`

## 5. Architecture Overview

Single Node.js process with three logical modules:

```
                    +-----------+
  HTTP requests --> |    API    | --> PostgreSQL
                    +-----------+
                    |  Scanner  | --> GitHub API --> Redis cache
                    +-----------+
                    |  Notifier | --> SMTP (Mailtrap)
                    +-----------+
```

- **API Module** — handles subscriptions (subscribe, confirm, unsubscribe, list)
- **Scanner Module** — cron job checks GitHub for new releases, creates notification records
- **Notifier Module** — cron job sends pending emails with retry (max 3 attempts)

These modules share the same process but have clear boundaries. Could be extracted to microservices in the future if needed.

## 6. Key Early Decisions

1. **Separate `repositories` table** — `last_seen_tag` is per-repo, not per-subscription. If 500 users follow `facebook/react`, we make one GitHub API call, not 500.

2. **`notifications` table instead of inline sending** — Scanner creates `pending` records, Notifier processes them asynchronously. This gives us retry, observability, and decoupling.

3. **`status` field (not boolean)** — Subscription lifecycle is `pending -> active -> unsubscribed`. A boolean can't express three states cleanly.

4. **Double opt-in** — Subscription activates only after clicking a UUID token link in email. Each notification includes a unique unsubscribe token.

5. **GitHub releases list, not `/latest`** — If multiple releases happen between scans, we detect all of them and notify about each one.
