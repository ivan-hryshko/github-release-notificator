import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  repositories,
  subscriptions,
  notifications,
  scanJobs,
  users,
} from '../db/schema.js';

export async function getRepositoriesWithActiveSubscriptions() {
  return db
    .selectDistinct({
      id: repositories.id,
      owner: repositories.owner,
      repo: repositories.repo,
      lastSeenTag: repositories.lastSeenTag,
    })
    .from(repositories)
    .innerJoin(subscriptions, eq(subscriptions.repositoryId, repositories.id))
    .where(eq(subscriptions.status, 'active'));
}

export async function getActiveSubscriptionsForRepo(repositoryId: number) {
  return db
    .select({
      subscriptionId: subscriptions.id,
      email: users.email,
      unsubscribeToken: subscriptions.unsubscribeToken,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(
      and(
        eq(subscriptions.repositoryId, repositoryId),
        eq(subscriptions.status, 'active'),
      ),
    );
}

export async function notificationExists(
  subscriptionId: number,
  releaseTag: string,
) {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.subscriptionId, subscriptionId),
        eq(notifications.releaseTag, releaseTag),
      ),
    )
    .limit(1);

  return !!row;
}

export async function createNotification(data: {
  subscriptionId: number;
  type: string;
  releaseTag: string;
}) {
  const [row] = await db
    .insert(notifications)
    .values(data)
    .returning();

  return row;
}

export async function createScanJob() {
  const [job] = await db
    .insert(scanJobs)
    .values({ status: 'running', startedAt: new Date() })
    .returning();

  return job;
}

export async function updateScanJob(
  id: number,
  data: Partial<{
    status: string;
    reposChecked: number;
    releasesFound: number;
    notificationsCreated: number;
    errorCount: number;
    errorMessage: string;
    finishedAt: Date;
  }>,
) {
  await db.update(scanJobs).set(data).where(eq(scanJobs.id, id));
}

export async function updateRepositoryChecked(
  repoId: number,
  lastSeenTag: string,
) {
  await db
    .update(repositories)
    .set({
      lastSeenTag,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(repositories.id, repoId));
}
