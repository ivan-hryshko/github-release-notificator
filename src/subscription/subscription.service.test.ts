import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateToken } = vi.hoisted(() => ({
  mockGenerateToken: vi.fn(),
}));

vi.mock('../github/github.client.js', () => ({
  checkRepoExists: vi.fn(),
  fetchLatestRelease: vi.fn(),
}));

vi.mock('./subscription.repository.js', () => ({
  findOrCreateUser: vi.fn(),
  findOrCreateRepository: vi.fn(),
  findSubscription: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  findSubscriptionByConfirmToken: vi.fn(),
  findSubscriptionByUnsubscribeToken: vi.fn(),
  findActiveSubscriptionsByEmail: vi.fn(),
  updateRepositoryLastSeenTag: vi.fn(),
}));

vi.mock('../common/token.js', () => ({
  generateToken: mockGenerateToken,
}));

vi.mock('./subscription.validator.js', () => ({
  parseRepo: vi.fn((r: string) => {
    const [owner, repo] = r.split('/');
    return { owner, repo };
  }),
}));

vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  subscribe,
  confirmSubscription,
  unsubscribe,
  getSubscriptions,
} from './subscription.service.js';
import { checkRepoExists, fetchLatestRelease } from '../github/github.client.js';
import * as repo from './subscription.repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../common/errors.js';

const mockCheckRepoExists = vi.mocked(checkRepoExists);
const mockFetchLatestRelease = vi.mocked(fetchLatestRelease);

const defaultUser = { id: 1 };
const defaultRepo = { id: 10, owner: 'owner', repo: 'myrepo', lastSeenTag: null };
const defaultSub = {
  id: 5,
  userId: 1,
  repositoryId: 10,
  status: 'pending',
  confirmToken: 'ct',
  unsubscribeToken: 'ut',
};

function setupDefaults() {
  mockCheckRepoExists.mockResolvedValue(true);
  mockFetchLatestRelease.mockResolvedValue(null);
  vi.mocked(repo.findOrCreateUser).mockResolvedValue(defaultUser as never);
  vi.mocked(repo.findOrCreateRepository).mockResolvedValue(defaultRepo as never);
  vi.mocked(repo.findSubscription).mockResolvedValue(null as never);
  vi.mocked(repo.createSubscription).mockResolvedValue(defaultSub as never);
  mockGenerateToken.mockReturnValueOnce('token-1').mockReturnValueOnce('token-2');
}

describe('subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('throws NotFoundError when repo does not exist on GitHub', async () => {
    mockCheckRepoExists.mockResolvedValue(false);
    await expect(subscribe('a@b.com', 'owner/myrepo'))
      .rejects.toThrow(NotFoundError);
    expect(repo.findOrCreateUser).not.toHaveBeenCalled();
  });

  it('creates new subscription when none exists', async () => {
    const result = await subscribe('a@b.com', 'owner/myrepo');
    expect(result.isNew).toBe(true);
    expect(repo.createSubscription).toHaveBeenCalledWith({
      userId: 1,
      repositoryId: 10,
      confirmToken: 'token-1',
      unsubscribeToken: 'token-2',
    });
  });

  it('seeds lastSeenTag when repo has a release', async () => {
    mockFetchLatestRelease.mockResolvedValue({
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      html_url: '',
      published_at: '',
      draft: false,
      prerelease: false,
    });
    await subscribe('a@b.com', 'owner/myrepo');
    expect(repo.updateRepositoryLastSeenTag).toHaveBeenCalledWith(10, 'v1.0.0');
  });

  it('skips seed when repo already has lastSeenTag', async () => {
    vi.mocked(repo.findOrCreateRepository).mockResolvedValue({
      ...defaultRepo,
      lastSeenTag: 'v0.9',
    } as never);
    await subscribe('a@b.com', 'owner/myrepo');
    expect(mockFetchLatestRelease).not.toHaveBeenCalled();
  });

  it('does not update tag when no release exists', async () => {
    mockFetchLatestRelease.mockResolvedValue(null);
    await subscribe('a@b.com', 'owner/myrepo');
    expect(repo.updateRepositoryLastSeenTag).not.toHaveBeenCalled();
  });

  it('throws ConflictError for active subscription', async () => {
    vi.mocked(repo.findSubscription).mockResolvedValue({
      ...defaultSub,
      status: 'active',
    } as never);
    await expect(subscribe('a@b.com', 'owner/myrepo'))
      .rejects.toThrow(ConflictError);
  });

  it('returns existing subscription for pending status', async () => {
    vi.mocked(repo.findSubscription).mockResolvedValue({
      ...defaultSub,
      status: 'pending',
    } as never);
    const result = await subscribe('a@b.com', 'owner/myrepo');
    expect(result.isNew).toBe(false);
    expect(repo.createSubscription).not.toHaveBeenCalled();
    expect(repo.updateSubscription).not.toHaveBeenCalled();
  });

  it('throws ConflictError on concurrent duplicate subscription (Postgres 23505)', async () => {
    vi.mocked(repo.createSubscription).mockRejectedValue(
      Object.assign(new Error('unique_violation'), { code: '23505' }),
    );
    await expect(subscribe('a@b.com', 'owner/myrepo'))
      .rejects.toThrow(ConflictError);
  });

  it('re-throws non-unique-violation errors from createSubscription', async () => {
    vi.mocked(repo.createSubscription).mockRejectedValue(new Error('DB connection lost'));
    await expect(subscribe('a@b.com', 'owner/myrepo'))
      .rejects.toThrow('DB connection lost');
  });

  it('re-subscribes with new tokens when unsubscribed', async () => {
    vi.mocked(repo.findSubscription).mockResolvedValue({
      ...defaultSub,
      status: 'unsubscribed',
    } as never);
    const updated = { ...defaultSub, status: 'pending', confirmToken: 'token-1' };
    vi.mocked(repo.updateSubscription).mockResolvedValue(updated as never);

    const result = await subscribe('a@b.com', 'owner/myrepo');
    expect(result.isNew).toBe(true);
    expect(repo.updateSubscription).toHaveBeenCalledWith(5, {
      status: 'pending',
      confirmToken: 'token-1',
      unsubscribeToken: 'token-2',
    });
  });
});

describe('confirmSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundError when token not found', async () => {
    vi.mocked(repo.findSubscriptionByConfirmToken).mockResolvedValue(null as never);
    await expect(confirmSubscription('bad-token')).rejects.toThrow(NotFoundError);
  });

  it('returns sub without update when already active', async () => {
    vi.mocked(repo.findSubscriptionByConfirmToken).mockResolvedValue({
      ...defaultSub,
      status: 'active',
    } as never);
    const result = await confirmSubscription('ct');
    expect(result.status).toBe('active');
    expect(repo.updateSubscription).not.toHaveBeenCalled();
  });

  it('updates pending subscription to active', async () => {
    vi.mocked(repo.findSubscriptionByConfirmToken).mockResolvedValue(defaultSub as never);
    const updated = { ...defaultSub, status: 'active' };
    vi.mocked(repo.updateSubscription).mockResolvedValue(updated as never);

    await confirmSubscription('ct');
    expect(repo.updateSubscription).toHaveBeenCalledWith(5, { status: 'active' });
  });
});

describe('unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundError when token not found', async () => {
    vi.mocked(repo.findSubscriptionByUnsubscribeToken).mockResolvedValue(null as never);
    await expect(unsubscribe('bad-token')).rejects.toThrow(NotFoundError);
  });

  it('updates subscription to unsubscribed', async () => {
    vi.mocked(repo.findSubscriptionByUnsubscribeToken).mockResolvedValue(defaultSub as never);
    vi.mocked(repo.updateSubscription).mockResolvedValue({
      ...defaultSub,
      status: 'unsubscribed',
    } as never);

    await unsubscribe('ut');
    expect(repo.updateSubscription).toHaveBeenCalledWith(5, { status: 'unsubscribed' });
  });
});

describe('getSubscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError for empty email', async () => {
    await expect(getSubscriptions('')).rejects.toThrow(ValidationError);
  });

  it('returns empty array when no subscriptions', async () => {
    vi.mocked(repo.findActiveSubscriptionsByEmail).mockResolvedValue([]);
    expect(await getSubscriptions('a@b.com')).toEqual([]);
  });

  it('maps DB rows to API response shape', async () => {
    vi.mocked(repo.findActiveSubscriptionsByEmail).mockResolvedValue([
      { email: 'a@b.com', owner: 'org', repo: 'lib', confirmed: 'active', lastSeenTag: 'v2' },
    ] as never);

    const result = await getSubscriptions('a@b.com');
    expect(result).toEqual([
      { email: 'a@b.com', repo: 'org/lib', confirmed: true, last_seen_tag: 'v2' },
    ]);
  });

  it('maps null lastSeenTag to null', async () => {
    vi.mocked(repo.findActiveSubscriptionsByEmail).mockResolvedValue([
      { email: 'a@b.com', owner: 'o', repo: 'r', confirmed: 'active', lastSeenTag: undefined },
    ] as never);

    const result = await getSubscriptions('a@b.com');
    expect(result[0].last_seen_tag).toBeNull();
  });
});
