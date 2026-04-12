import { generateToken } from '../common/token.js';
import { NotFoundError, ConflictError, ValidationError } from '../common/errors.js';
import { checkRepoExists, fetchLatestRelease } from '../github/github.client.js';
import { parseRepo } from './subscription.validator.js';
import * as repo from './subscription.repository.js';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
}

export async function subscribe(email: string, repoFullName: string) {
  const { owner, repo: repoName } = parseRepo(repoFullName);

  const exists = await checkRepoExists(owner, repoName);
  if (!exists) {
    throw new NotFoundError('Repository not found on GitHub');
  }

  const user = await repo.findOrCreateUser(email);
  const repository = await repo.findOrCreateRepository(owner, repoName);

  await seedLastSeenTag(repository);

  const existing = await repo.findSubscription(user.id, repository.id);

  if (existing) {
    return handleExistingSubscription(existing);
  }

  try {
    const sub = await repo.createSubscription({
      userId: user.id,
      repositoryId: repository.id,
      confirmToken: generateToken(),
      unsubscribeToken: generateToken(),
    });

    return { subscription: sub, isNew: true };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('Email already subscribed to this repository');
    }
    throw err;
  }
}

async function seedLastSeenTag(
  repository: { id: number; owner: string; repo: string; lastSeenTag: string | null },
) {
  if (repository.lastSeenTag) return;

  const latest = await fetchLatestRelease(repository.owner, repository.repo);
  if (latest) {
    await repo.updateRepositoryLastSeenTag(repository.id, latest.tag_name);
  }
}

async function handleExistingSubscription(
  existing: { id: number; status: string; confirmToken: string },
) {
  if (existing.status === 'active') {
    throw new ConflictError('Email already subscribed to this repository');
  }

  if (existing.status === 'pending') {
    return { subscription: existing, isNew: false };
  }

  // status === 'unsubscribed' → re-subscribe
  const updated = await repo.updateSubscription(existing.id, {
    status: 'pending',
    confirmToken: generateToken(),
    unsubscribeToken: generateToken(),
  });

  return { subscription: updated, isNew: true };
}

export async function confirmSubscription(token: string) {
  const sub = await repo.findSubscriptionByConfirmToken(token);
  if (!sub) {
    throw new NotFoundError('Token not found');
  }

  if (sub.status === 'active') {
    return sub;
  }

  return repo.updateSubscription(sub.id, { status: 'active' });
}

export async function unsubscribe(token: string) {
  const sub = await repo.findSubscriptionByUnsubscribeToken(token);
  if (!sub) {
    throw new NotFoundError('Token not found');
  }

  return repo.updateSubscription(sub.id, { status: 'unsubscribed' });
}

export async function getSubscriptions(email: string) {
  if (!email) {
    throw new ValidationError('Invalid email');
  }

  const subs = await repo.findActiveSubscriptionsByEmail(email);

  return subs.map((s) => ({
    email: s.email,
    repo: `${s.owner}/${s.repo}`,
    confirmed: s.confirmed === 'active',
    last_seen_tag: s.lastSeenTag ?? null,
  }));
}
