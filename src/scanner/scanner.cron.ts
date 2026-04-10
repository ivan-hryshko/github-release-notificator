import cron from 'node-cron';
import { logger } from '../common/logger.js';
import { env } from '../config/env.js';
import { scanRepositories } from './scanner.service.js';
import { createScanJob, updateScanJob } from './scanner.repository.js';

let isScanning = false;

export function startScannerCron(): cron.ScheduledTask {
  logger.info({ interval: env.SCAN_INTERVAL }, 'Starting scanner cron');

  return cron.schedule(env.SCAN_INTERVAL, async () => {
    if (isScanning) {
      logger.warn('Scanner already running, skipping');
      return;
    }

    isScanning = true;
    const job = await createScanJob();

    try {
      const stats = await scanRepositories();

      await updateScanJob(job.id, {
        status: 'completed',
        ...stats,
        finishedAt: new Date(),
      });

      logger.info(stats, 'Scan completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await updateScanJob(job.id, {
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      });
      logger.error({ err }, 'Scan failed');
    } finally {
      isScanning = false;
    }
  });
}
