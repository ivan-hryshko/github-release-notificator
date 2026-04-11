# ADR-003: Manual CD Pipeline via GitHub Actions

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-12

---

## Context

Deploying to the DigitalOcean droplet required SSH-ing into the server and running `git pull` + `docker compose up --build` manually. This is error-prone and slows down the release cycle, especially when iterating quickly.

## Decision

Add a **manual deploy job** to the existing CI workflow (`.github/workflows/ci.yml`) using `workflow_dispatch` trigger and `appleboy/ssh-action`.

**How it works:**
1. Developer clicks "Run workflow" in GitHub Actions UI
2. `lint-and-test` and `integration` jobs run first
3. If both pass, `deploy` job SSH-es into the server and runs `git pull` + `docker compose up -d --build`

**Why manual, not automatic:**
- Automatic deploy on every push to main is risky for a solo project without staging environment
- Manual trigger gives explicit control over when production is updated
- Tests still run before deploy — broken code cannot be deployed

## Alternatives Considered

1. **Auto-deploy on push to main** — rejected: no staging environment, too risky for a test task
2. **Separate deploy workflow file** — rejected: simpler to keep everything in one CI file since the deploy depends on the same test jobs
3. **Container registry + pull-based deploy** — rejected: over-engineered for a single droplet

## Consequences

- Deploy is one click instead of manual SSH
- Tests are always validated before deploy
- Requires three GitHub secrets: `SERVER_IP`, `SERVER_USER`, `SSH_PRIVATE_KEY`
- Server must have git access to the repository (SSH key or HTTPS token)
