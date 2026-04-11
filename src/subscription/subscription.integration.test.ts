import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Set API_KEY before importing app (env is loaded at import time)
const TEST_API_KEY = 'test-integration-key';
process.env.API_KEY = TEST_API_KEY;

import { app } from '../app.js';
import { pool } from '../config/database.js';
import { runMigrations } from '../db/migrate.js';
import type { Server } from 'node:http';

const PORT = 4000;
let server: Server;

async function request(path: string, options?: RequestInit) {
  return fetch(`http://localhost:${PORT}${path}`, options);
}

async function authedRequest(path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  headers.set('X-API-Key', TEST_API_KEY);
  return fetch(`http://localhost:${PORT}${path}`, { ...options, headers });
}

async function post(path: string, body: object) {
  return authedRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getToken(column: string): Promise<string> {
  const result = await pool.query(
    `SELECT ${column} FROM subscriptions ORDER BY id DESC LIMIT 1`,
  );
  return result.rows[0][column];
}

async function cleanDb() {
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM subscriptions');
  await pool.query('DELETE FROM repositories');
  await pool.query('DELETE FROM users');
}

describe('Subscription API', () => {
  beforeAll(async () => {
    await runMigrations();
    server = app.listen(PORT);
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  // ─── POST /api/subscribe ──────────────────────────────

  describe('POST /api/subscribe', () => {
    it('returns 400 for invalid repo format', async () => {
      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email', async () => {
      const res = await post('/api/subscribe', {
        email: 'not-an-email',
        repo: 'golang/go',
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent repo', async () => {
      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'zzz-fake-user-12345/zzz-fake-repo-12345',
      });
      expect(res.status).toBe(404);
    });

    it('returns 200 for valid subscription', async () => {
      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('Subscription successful');
    });

    it('returns 200 for pending resend', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });

      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      expect(res.status).toBe(200);
    });

    it('returns 409 for duplicate after confirm', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });

      const token = await getToken('confirm_token');
      await request(`/api/confirm/${token}`);

      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      expect(res.status).toBe(409);
    });
  });

  // ─── GET /api/confirm/:token ──────────────────────────

  describe('GET /api/confirm/:token', () => {
    it('returns 400 for invalid token format', async () => {
      const res = await request('/api/confirm/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent token', async () => {
      const res = await request(
        '/api/confirm/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });

    it('returns 200 and confirms subscription', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });

      const token = await getToken('confirm_token');
      const res = await request(`/api/confirm/${token}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('confirmed');
    });

    it('returns 200 for already confirmed (idempotent)', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });

      const token = await getToken('confirm_token');
      await request(`/api/confirm/${token}`);

      const res = await request(`/api/confirm/${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ─── GET /api/unsubscribe/:token ──────────────────────

  describe('GET /api/unsubscribe/:token', () => {
    it('returns 400 for invalid token format', async () => {
      const res = await request('/api/unsubscribe/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent token', async () => {
      const res = await request(
        '/api/unsubscribe/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });

    it('returns 200 and unsubscribes', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });

      const token = await getToken('unsubscribe_token');
      const res = await request(`/api/unsubscribe/${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ─── GET /api/subscriptions ───────────────────────────

  describe('GET /api/subscriptions', () => {
    it('returns 400 for invalid email', async () => {
      const res = await authedRequest('/api/subscriptions?email=invalid');
      expect(res.status).toBe(400);
    });

    it('returns empty array for unknown email', async () => {
      const res = await authedRequest(
        '/api/subscriptions?email=nobody@example.com',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns active subscriptions', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      const token = await getToken('confirm_token');
      await request(`/api/confirm/${token}`);

      const res = await authedRequest(
        '/api/subscriptions?email=test@example.com',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
        confirmed: true,
      });
    });

    it('excludes unsubscribed', async () => {
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      const confirmToken = await getToken('confirm_token');
      await request(`/api/confirm/${confirmToken}`);

      const unsubToken = await getToken('unsubscribe_token');
      await request(`/api/unsubscribe/${unsubToken}`);

      const res = await authedRequest(
        '/api/subscriptions?email=test@example.com',
      );
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  // ─── Re-subscribe flow ────────────────────────────────

  describe('Re-subscribe after unsubscribe', () => {
    it('allows re-subscribing with new tokens', async () => {
      // Subscribe + confirm
      await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      const token1 = await getToken('confirm_token');
      await request(`/api/confirm/${token1}`);

      // Unsubscribe
      const unsubToken = await getToken('unsubscribe_token');
      await request(`/api/unsubscribe/${unsubToken}`);

      // Re-subscribe
      const res = await post('/api/subscribe', {
        email: 'test@example.com',
        repo: 'anthropics/claude-code',
      });
      expect(res.status).toBe(200);

      // New confirm token should be different
      const token2 = await getToken('confirm_token');
      expect(token2).not.toBe(token1);

      // Confirm and verify active
      await request(`/api/confirm/${token2}`);
      const subsRes = await authedRequest(
        '/api/subscriptions?email=test@example.com',
      );
      const body = await subsRes.json();
      expect(body).toHaveLength(1);
    });
  });

  // ─── API Key Authentication ──────────────────────────

  describe('API Key Authentication', () => {
    it('returns 401 for POST /subscribe without key', async () => {
      const res = await request('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', repo: 'golang/go' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 for GET /subscriptions without key', async () => {
      const res = await request('/api/subscriptions?email=test@example.com');
      expect(res.status).toBe(401);
    });

    it('allows GET /confirm/:token without key', async () => {
      const res = await request(
        '/api/confirm/00000000-0000-0000-0000-000000000000',
      );
      // 404 = no auth block, token just not found
      expect(res.status).toBe(404);
    });

    it('allows GET /unsubscribe/:token without key', async () => {
      const res = await request(
        '/api/unsubscribe/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });
  });
});
