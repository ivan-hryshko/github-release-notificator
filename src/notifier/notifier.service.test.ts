import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendMail, mockEnv } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockEnv: {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    EMAIL_FROM: 'from@test.com',
  },
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../config/env.js', () => ({ env: mockEnv }));

import { sendEmail } from './notifier.service.js';
import nodemailer from 'nodemailer';
import { logger } from '../common/logger.js';

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.SMTP_USER = 'user';
    mockEnv.SMTP_PASS = 'pass';
  });

  it('returns false and warns when SMTP_USER is empty', async () => {
    mockEnv.SMTP_USER = '';
    const result = await sendEmail('to@x.com', 'sub', '<p>hi</p>');
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('returns false and warns when SMTP_PASS is empty', async () => {
    mockEnv.SMTP_PASS = '';
    const result = await sendEmail('to@x.com', 'sub', '<p>hi</p>');
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('creates transport with correct config and sends email', async () => {
    mockSendMail.mockResolvedValueOnce({});
    const result = await sendEmail('to@x.com', 'Subject', '<p>body</p>');
    expect(result).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      auth: { user: 'user', pass: 'pass' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'from@test.com',
      to: 'to@x.com',
      subject: 'Subject',
      html: '<p>body</p>',
    });
    expect(logger.info).toHaveBeenCalled();
  });

  it('returns false and logs error on send failure', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const result = await sendEmail('to@x.com', 'sub', '<p>hi</p>');
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
