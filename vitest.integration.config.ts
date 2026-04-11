import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      PORT: '3000',
      NODE_ENV: 'test',
      BASE_URL: 'http://localhost:4000',
      DATABASE_URL: 'postgresql://app:secret@localhost:5432/releases',
      REDIS_URL: 'redis://localhost:6379',
      SMTP_HOST: 'sandbox.smtp.mailtrap.io',
      SMTP_PORT: '587',
      SMTP_USER: '',
      SMTP_PASS: '',
      EMAIL_FROM: 'noreply@releases-api.app',
      SCAN_INTERVAL: '*/5 * * * *',
      NOTIFY_INTERVAL: '*/1 * * * *',
      NOTIFY_MAX_ATTEMPTS: '3',
      API_KEY: 'test-integration-key',
    },
  },
});
