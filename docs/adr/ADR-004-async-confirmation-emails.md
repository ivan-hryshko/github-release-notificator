# ADR-004: Asynchronous Confirmation Emails via Notification Pipeline

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-12

---

## Context

Confirmation emails are currently sent **synchronously** inside the `POST /subscribe` HTTP handler. This creates two problems:

1. **No retry mechanism.** If the SMTP server is temporarily unavailable, the email is silently lost. The user sees "check your email" but nothing arrives — with no record of the failure and no automatic retry.
2. **Blocked response.** The API response is delayed by the SMTP handshake (1–3 seconds), degrading user experience.

Meanwhile, release notification emails already go through a reliable pipeline: a `notifications` record is created with status `pending`, the notifier cron picks it up, sends it via SMTP, and retries on failure (up to 3 attempts). Confirmation emails bypass this pipeline entirely.

## Decision

Move confirmation email delivery into the existing notification pipeline. Instead of calling `sendEmail()` inline, the subscribe endpoint creates a `notifications` record with `type: 'confirmation'`. The notifier cron processes it alongside release notifications, with the same retry logic.

The notifier dispatches templates based on the `type` field:
- `type === 'confirmation'` → `confirmationEmail(confirmToken)`
- `type === 'release'` → `releaseNotificationEmail(...)`

## Consequences

**Positive:**
- Automatic retries (up to 3 attempts) for failed SMTP connections
- API responds immediately without waiting for email delivery
- Complete audit trail of every confirmation email attempt in the `notifications` table
- Unified email pipeline — one code path for all outgoing emails

**Negative:**
- Confirmation emails may be delayed by up to 60 seconds (notifier cron interval)
- Slightly more complex notification processing logic (type-based dispatch)

**Why the delay is acceptable:**
Users typically switch to their email client after subscribing and refresh the inbox. A sub-minute delay is imperceptible in practice and well within normal email delivery expectations.
