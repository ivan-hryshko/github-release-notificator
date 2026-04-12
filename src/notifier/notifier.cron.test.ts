import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./notifier.repository.js', () => ({
  getPendingNotifications: vi.fn(),
  markNotificationSent: vi.fn(),
  markNotificationFailed: vi.fn(),
}));

vi.mock('./notifier.service.js', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('./notifier.templates.js', () => ({
  confirmationEmail: vi.fn(() => ({
    subject: 'Confirm your subscription',
    html: '<p>confirm</p>',
  })),
  releaseNotificationEmail: vi.fn(() => ({
    subject: 'New release: org/lib v2',
    html: '<p>release</p>',
  })),
}));

vi.mock('../config/env.js', () => ({
  env: { NOTIFY_INTERVAL: '*/1 * * * *', NOTIFY_MAX_ATTEMPTS: 3 },
}));

vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { processNotifications } from './notifier.cron.js';
import { sendEmail } from './notifier.service.js';
import { confirmationEmail, releaseNotificationEmail } from './notifier.templates.js';
import {
  getPendingNotifications,
  markNotificationSent,
  markNotificationFailed,
} from './notifier.repository.js';

const mockSendEmail = vi.mocked(sendEmail);
const mockGetPending = vi.mocked(getPendingNotifications);

const notification = {
  id: 1,
  subscriptionId: 10,
  type: 'release',
  releaseTag: 'v2.0.0',
  attempts: 0,
  email: 'user@test.com',
  owner: 'org',
  repo: 'lib',
  unsubscribeToken: 'unsub-tok',
  confirmToken: 'confirm-tok',
};

describe('processNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPending.mockResolvedValue([]);
  });

  it('does nothing when no pending notifications', async () => {
    const result = await processNotifications();
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends email and marks as sent on success', async () => {
    mockGetPending.mockResolvedValue([notification]);
    mockSendEmail.mockResolvedValue(true);

    const result = await processNotifications();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(markNotificationSent).toHaveBeenCalledWith(1);
    expect(sendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'New release: org/lib v2',
      '<p>release</p>',
    );
  });

  it('marks as failed when email send fails', async () => {
    mockGetPending.mockResolvedValue([notification]);
    mockSendEmail.mockResolvedValue(false);

    const result = await processNotifications();

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(markNotificationFailed).toHaveBeenCalledWith(1, 'Email send failed');
  });

  it('handles mixed batch correctly', async () => {
    mockGetPending.mockResolvedValue([
      notification,
      { ...notification, id: 2, email: 'b@test.com' },
    ]);
    mockSendEmail
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await processNotifications();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(markNotificationSent).toHaveBeenCalledWith(1);
    expect(markNotificationFailed).toHaveBeenCalledWith(2, 'Email send failed');
  });

  it('renders release template with correct data', async () => {
    mockGetPending.mockResolvedValue([notification]);
    mockSendEmail.mockResolvedValue(true);

    await processNotifications();

    expect(releaseNotificationEmail).toHaveBeenCalledWith(
      'org/lib',
      'v2.0.0',
      'v2.0.0',
      'https://github.com/org/lib/releases/tag/v2.0.0',
      'unsub-tok',
    );
  });

  it('renders confirmation template for confirmation type', async () => {
    const confirmNotification = {
      ...notification,
      id: 2,
      type: 'confirmation',
      releaseTag: null,
    };
    mockGetPending.mockResolvedValue([confirmNotification]);
    mockSendEmail.mockResolvedValue(true);

    const result = await processNotifications();

    expect(result.sent).toBe(1);
    expect(confirmationEmail).toHaveBeenCalledWith('confirm-tok');
    expect(releaseNotificationEmail).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Confirm your subscription',
      '<p>confirm</p>',
    );
  });
});
