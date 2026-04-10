import { env } from './config/env.js';
import { app } from './app.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './common/logger.js';
import { pool } from './config/database.js';
import { disconnectRedis } from './common/redis.js';
import { startScannerCron } from './scanner/scanner.cron.js';
import { startNotifierCron } from './notifier/notifier.cron.js';

async function start(): Promise<void> {
  await runMigrations();

  startScannerCron();
  startNotifierCron();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });

  function shutdown(): void {
    logger.info('Shutting down...');
    server.close(async () => {
      await pool.end();
      await disconnectRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
