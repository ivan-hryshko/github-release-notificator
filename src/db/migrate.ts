import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../config/database.js';
import { logger } from '../common/logger.js';

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  await migrate(db, {
    migrationsFolder: new URL('./migrations', import.meta.url).pathname,
  });

  logger.info('Migrations completed');
}
