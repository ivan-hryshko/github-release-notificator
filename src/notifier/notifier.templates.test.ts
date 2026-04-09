import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: { BASE_URL: 'https://example.com' },
}));

import { confirmationEmail, releaseNotificationEmail } from './notifier.templates.js';

describe('confirmationEmail', () => {
  it('returns correct subject', () => {
    const result = confirmationEmail('abc-token');
    expect(result.subject).toBe(
      'Confirm your subscription — GitHub Release Notificator',
    );
  });

  it('html contains confirm URL', () => {
    const result = confirmationEmail('abc-token');
    expect(result.html).toContain(
      'https://example.com/api/confirm/abc-token',
    );
  });

  it('html contains the URL as both href and text', () => {
    const result = confirmationEmail('abc-token');
    const url = 'https://example.com/api/confirm/abc-token';
    const matches = result.html.match(new RegExp(url, 'g'));
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('releaseNotificationEmail', () => {
  const args = [
    'owner/repo',
    'v1.2.0',
    'Release 1.2',
    'https://github.com/owner/repo/releases/tag/v1.2.0',
    'unsub-token',
  ] as const;

  it('returns correct subject with repo and tag', () => {
    const result = releaseNotificationEmail(...args);
    expect(result.subject).toBe('New release: owner/repo v1.2.0');
  });

  it('html contains release name', () => {
    const result = releaseNotificationEmail(...args);
    expect(result.html).toContain('Release 1.2');
  });

  it('html contains GitHub release URL', () => {
    const result = releaseNotificationEmail(...args);
    expect(result.html).toContain(
      'https://github.com/owner/repo/releases/tag/v1.2.0',
    );
  });

  it('html contains unsubscribe URL', () => {
    const result = releaseNotificationEmail(...args);
    expect(result.html).toContain(
      'https://example.com/api/unsubscribe/unsub-token',
    );
  });

  it('falls back to tagName when releaseName is empty', () => {
    const result = releaseNotificationEmail(
      'owner/repo',
      'v1.2.0',
      '',
      'https://github.com/owner/repo/releases/tag/v1.2.0',
      'unsub-token',
    );
    expect(result.html).toContain('<strong>v1.2.0</strong>');
  });
});
