import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
]);

// ─── Repositories ────────────────────────────────────────────

export const repositories = pgTable('repositories', {
  id: serial('id').primaryKey(),
  owner: varchar('owner', { length: 255 }).notNull(),
  repo: varchar('repo', { length: 255 }).notNull(),
  lastSeenTag: varchar('last_seen_tag', { length: 255 }),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('repositories_owner_repo_idx').on(table.owner, table.repo),
]);

// ─── Subscriptions ───────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  repositoryId: integer('repository_id').notNull().references(() => repositories.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  confirmToken: varchar('confirm_token', { length: 64 }).notNull(),
  unsubscribeToken: varchar('unsubscribe_token', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('subscriptions_user_repo_idx').on(table.userId, table.repositoryId),
  index('subscriptions_confirm_token_idx').on(table.confirmToken),
  index('subscriptions_unsubscribe_token_idx').on(table.unsubscribeToken),
  index('subscriptions_status_idx').on(table.status),
]);

// ─── Scan Jobs ───────────────────────────────────────────────

export const scanJobs = pgTable('scan_jobs', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 20 }).notNull(),
  reposChecked: integer('repos_checked').notNull().default(0),
  releasesFound: integer('releases_found').notNull().default(0),
  notificationsCreated: integer('notifications_created').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at'),
});

// ─── Notifications ───────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  subscriptionId: integer('subscription_id').notNull().references(() => subscriptions.id),
  type: varchar('type', { length: 20 }).notNull(),
  releaseTag: varchar('release_tag', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'),
}, (table) => [
  index('notifications_status_idx').on(table.status),
  index('notifications_subscription_id_idx').on(table.subscriptionId),
]);
