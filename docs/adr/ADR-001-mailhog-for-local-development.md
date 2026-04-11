# ADR-001: Switch from Mailtrap to MailHog for Local Development

**Status:** Accepted  
**Author:** Ivan Hryshko  
**Date:** 2026-04-10

---

## Context

During development, I use Claude (AI assistant) as a pair programmer. Claude can execute shell commands, read files, and call HTTP APIs — but it cannot log into web services like Mailtrap's dashboard to verify that emails were actually sent.

Initially, email testing in local dev used Mailtrap's sandbox SMTP. To check if an email arrived, I had to open the Mailtrap web UI manually and report back to Claude. This broke the feedback loop.

## Decision

Replace Mailtrap with **MailHog** for local development.

MailHog runs as a Docker container alongside Postgres and Redis in `docker-compose.dev.yml`:
- SMTP on port `1025` — the app sends emails here
- REST API on port `8025` — programmatic access to received emails

## Why MailHog

- **REST API** — Claude can verify email delivery with a simple curl:
  ```bash
  curl http://localhost:8025/api/v2/messages
  ```
  No browser, no login, no credentials needed.
- **Zero configuration** — no account signup, no API tokens, works offline
- **Docker-native** — single image, no volumes, no state to manage

## Trade-off

Mailtrap is still used for **production** email delivery (`live.smtp.mailtrap.io`). This ADR only affects the local dev environment.

## Consequences

- Claude can now independently test the full email flow: subscribe → confirm → scan → notification → verify email content
- Developers can also use MailHog's web UI at `http://localhost:8025` for visual inspection
- Added `grn-mailhog-dev` service to `docker-compose.dev.yml`
