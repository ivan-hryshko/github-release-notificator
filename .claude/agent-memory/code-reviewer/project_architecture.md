---
name: Project architecture and conventions
description: Key architectural patterns, module boundaries, and coding conventions observed in the GitHub Release Notificator codebase
type: project
---

Feature-based monolith: subscription, scanner, notifier, github modules each with router/service/repository layers.

**Why:** SE School 6.0 test task requires monolith Express + TS with specific Swagger contract compliance.

**How to apply:**
- Subscription flow: subscribe (with GitHub repo validation + email confirmation) -> confirm -> unsubscribe. Re-subscribe from unsubscribed state is supported.
- Scanner cron checks repos with active subscriptions, creates notification records for new releases.
- Notifier cron processes pending notifications, retries up to NOTIFY_MAX_ATTEMPTS times.
- GitHub client uses Redis caching with ETag-based conditional requests and rate limit tracking.
- Status values: subscriptions use pending/active/unsubscribed; notifications use pending/sent/failed.
- Tokens are crypto.randomUUID() stored in DB with indexes.
- Scanner uses in-memory isScanning boolean mutex (not DB-level).
- Prometheus metrics dependency exists in package.json but /metrics endpoint is NOT implemented.
- gRPC is NOT implemented.
- Integration tests use raw SQL for cleanup and direct pool.query for token retrieval.
