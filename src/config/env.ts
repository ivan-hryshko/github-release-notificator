import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BASE_URL: z.string().url().default('http://localhost:3000'),

  API_KEY: z.string().optional().transform(v => v || undefined),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  GITHUB_TOKEN: z.string().optional().transform(v => v || undefined),

  SMTP_HOST: z.string().default('sandbox.smtp.mailtrap.io'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@releases-api.app'),

  SCAN_INTERVAL: z.string().default('*/5 * * * *'),
  NOTIFY_INTERVAL: z.string().default('*/1 * * * *'),
  NOTIFY_MAX_ATTEMPTS: z.coerce.number().default(3),

  GITHUB_CACHE_TTL: z.coerce.number().default(600),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const missing = Object.entries(formatted)
      .filter(([key, val]) => key !== '_errors' && val && typeof val === 'object' && '_errors' in val)
      .map(([key, val]) => `  ${key}: ${(val as { _errors: string[] })._errors.join(', ')}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${missing}`);
  }

  return result.data;
}

export const env = loadEnv();
