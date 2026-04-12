import { eq, and, or, lt, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { notifications, subscriptions, users, repositories } from '../db/schema.js';
import { env } from '../config/env.js';

export async function createConfirmationNotification(subscriptionId: number) {
  await db.insert(notifications).values({
    subscriptionId,
    type: 'confirmation',
    status: 'pending',
  });
}

export async function getPendingNotifications(limit: number) {
  return db
    .select({
      id: notifications.id,
      subscriptionId: notifications.subscriptionId,
      type: notifications.type,
      releaseTag: notifications.releaseTag,
      attempts: notifications.attempts,
      email: users.email,
      owner: repositories.owner,
      repo: repositories.repo,
      unsubscribeToken: subscriptions.unsubscribeToken,
      confirmToken: subscriptions.confirmToken,
    })
    .from(notifications)
    .innerJoin(subscriptions, eq(notifications.subscriptionId, subscriptions.id))
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .innerJoin(repositories, eq(subscriptions.repositoryId, repositories.id))
    .where(
      or(
        eq(notifications.status, 'pending'),
        and(
          eq(notifications.status, 'failed'),
          lt(notifications.attempts, env.NOTIFY_MAX_ATTEMPTS),
        ),
      ),
    )
    .orderBy(notifications.createdAt)
    .limit(limit);
}

export async function markNotificationSent(id: number) {
  await db
    .update(notifications)
    .set({
      status: 'sent',
      sentAt: new Date(),
      attempts: sql`${notifications.attempts} + 1`,
    })
    .where(eq(notifications.id, id));
}

export async function markNotificationFailed(
  id: number,
  errorMessage: string,
) {
  await db
    .update(notifications)
    .set({
      status: 'failed',
      errorMessage,
      attempts: sql`${notifications.attempts} + 1`,
    })
    .where(eq(notifications.id, id));
}
