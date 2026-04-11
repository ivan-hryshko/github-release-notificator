# ADR-002: Single Admin API Key for Authentication

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-11

---

## Context

The task extra requires "API key authentication: endpoints protected by a token in the header." We need to decide the scope and implementation of this feature.

## Decision

Use a **single admin API key** stored in the `.env` file (`API_KEY` variable). The key is checked via the `X-API-Key` request header.

**Protected endpoints:**
- `POST /api/subscribe` — requires API key
- `GET /api/subscriptions` — requires API key

**Unprotected endpoints:**
- `GET /api/confirm/:token` — accessed from email links, secured by UUID token
- `GET /api/unsubscribe/:token` — accessed from email links, secured by UUID token

**When `API_KEY` is empty or not set** — authentication is disabled entirely. All endpoints work without a key. This keeps local development frictionless.

## Why Not Per-User Keys

Per-user API keys would require:
- A key generation/management system
- A keys table in the database
- UI for key management (create, revoke, list)
- Key rotation strategy

This is significant scope for a test task. The single admin key approach demonstrates the authentication pattern while staying within time constraints.

## Trade-off

In a real product, this key would be generated individually for each developer/consumer via a dashboard or CLI. The current implementation is an administrative access mechanism — the key is shared with the reviewer via README or `.env.example`.

## Security: No localStorage for API Key

The API key input on the HTML page is **session-only** — the value lives only in the DOM input element and is never written to `localStorage` or `sessionStorage`. This is intentional: any value in web storage is readable by JavaScript, which means a single XSS vulnerability would allow an attacker to steal the key. By keeping it in-memory only, the key is lost when the tab closes, limiting the exposure window.

## Consequences

- The HTML page includes an API key input field (session-only, not persisted)
- Reviewers can test auth by setting `API_KEY` in `.env` and passing it via the UI or `X-API-Key` header
- Without setting `API_KEY`, the app behaves exactly as before (no breaking change)
- Users must re-enter the key when reopening the page (acceptable trade-off for security)
