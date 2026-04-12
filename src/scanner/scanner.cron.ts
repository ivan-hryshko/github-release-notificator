import cron from 'node-cron';
import { logger } from '../common/logger.js';
import { env } from '../config/env.js';
import { scanRepositories } from './scanner.service.js';
import { createScanJob, updateScanJob } from './scanner.repository.js';
import { scanRunsTotal } from '../metrics/metrics.js';

let isScanning = false;

export function startScannerCron(): cron.ScheduledTask {
  logger.info({ interval: env.SCAN_INTERVAL }, 'Starting scanner cron');

  return cron.schedule(env.SCAN_INTERVAL, async () => {
    if (isScanning) {
      logger.warn('Scanner already running, skipping');
      return;
    }

    isScanning = true;
    let job: Awaited<ReturnType<typeof createScanJob>> | undefined;

    try {
      job = await createScanJob();
      const stats = await scanRepositories();

      await updateScanJob(job.id, {
        status: 'completed',
        ...stats,
        finishedAt: new Date(),
      });

      scanRunsTotal.inc({ status: 'completed' });
      logger.info(stats, 'Scan completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (job) {
        await updateScanJob(job.id, {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        });
      }
      scanRunsTotal.inc({ status: 'failed' });
      logger.error({ err }, 'Scan failed');
    } finally {
      isScanning = false;
    }
  });
}
