import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, repositories, subscriptions } from '../db/schema.js';

export async function findOrCreateUser(email: string) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ email })
    .onConflictDoNothing()
    .returning();

  return created ?? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
}

export async function findOrCreateRepository(owner: string, repo: string) {
  const [existing] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.owner, owner), eq(repositories.repo, repo)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(repositories)
    .values({ owner, repo })
    .onConflictDoNothing()
    .returning();

  return created ?? (await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.owner, owner), eq(repositories.repo, repo)))
    .limit(1))[0];
}

export async function findSubscription(userId: number, repositoryId: number) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.repositoryId, repositoryId)))
    .limit(1);

  return sub ?? null;
}

export async function createSubscription(data: {
  userId: number;
  repositoryId: number;
  confirmToken: string;
  unsubscribeToken: string;
}) {
  const [sub] = await db.insert(subscriptions).values(data).returning();
  return sub;
}

export async function updateSubscription(
  id: number,
  data: Partial<{
    status: string;
    confirmToken: string;
    unsubscribeToken: string;
    updatedAt: Date;
  }>,
) {
  const [updated] = await db
    .update(subscriptions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();

  return updated;
}

export async function findSubscriptionByConfirmToken(token: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.confirmToken, token))
    .limit(1);

  return sub ?? null;
}

export async function findSubscriptionByUnsubscribeToken(token: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.unsubscribeToken, token))
    .limit(1);

  return sub ?? null;
}

export async function findActiveSubscriptionsByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return [];

  return db
    .select({
      email: users.email,
      repo: repositories.repo,
      owner: repositories.owner,
      confirmed: subscriptions.status,
      lastSeenTag: repositories.lastSeenTag,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .innerJoin(repositories, eq(subscriptions.repositoryId, repositories.id))
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'active')));
}

export async function updateRepositoryLastSeenTag(
  repositoryId: number,
  tag: string,
) {
  await db
    .update(repositories)
    .set({ lastSeenTag: tag, updatedAt: new Date() })
    .where(eq(repositories.id, repositoryId));
}
