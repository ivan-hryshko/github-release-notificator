import cron from 'node-cron';
import { logger } from '../common/logger.js';
import { env } from '../config/env.js';
import { sendEmail } from './notifier.service.js';
import { confirmationEmail, releaseNotificationEmail } from './notifier.templates.js';
import {
  getPendingNotifications,
  markNotificationSent,
  markNotificationFailed,
} from './notifier.repository.js';

type PendingNotification = Awaited<ReturnType<typeof getPendingNotifications>>[number];

function renderNotification(n: PendingNotification): { subject: string; html: string } {
  if (n.type === 'confirmation') {
    return confirmationEmail(n.confirmToken);
  }

  return releaseNotificationEmail(
    `${n.owner}/${n.repo}`,
    n.releaseTag ?? '',
    n.releaseTag ?? '',
    `https://github.com/${n.owner}/${n.repo}/releases/tag/${n.releaseTag}`,
    n.unsubscribeToken,
  );
}

export async function processNotifications(): Promise<{ sent: number; failed: number }> {
  const pending = await getPendingNotifications(50);
  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    const { subject, html } = renderNotification(n);

    const ok = await sendEmail(n.email, subject, html);

    if (ok) {
      await markNotificationSent(n.id);
      sent++;
    } else {
      await markNotificationFailed(n.id, 'Email send failed');
      failed++;
    }
  }

  return { sent, failed };
}

export function startNotifierCron(): cron.ScheduledTask {
  logger.info({ interval: env.NOTIFY_INTERVAL }, 'Starting notifier cron');

  return cron.schedule(env.NOTIFY_INTERVAL, async () => {
    try {
      const { sent, failed } = await processNotifications();
      if (sent || failed) {
        logger.info({ sent, failed }, 'Notifier batch done');
      }
    } catch (err) {
      logger.error({ err }, 'Notifier cron error');
    }
  });
}
