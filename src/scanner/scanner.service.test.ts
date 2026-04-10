import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../github/github.client.js', () => ({
  fetchReleases: vi.fn(),
}));

vi.mock('./scanner.repository.js', () => ({
  getRepositoriesWithActiveSubscriptions: vi.fn(),
  getActiveSubscriptionsForRepo: vi.fn(),
  notificationExists: vi.fn(),
  createNotification: vi.fn(),
  updateRepositoryChecked: vi.fn(),
}));

vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config/env.js', () => ({ env: {} }));

import { findNewReleases, scanRepositories } from './scanner.service.js';
import { fetchReleases } from '../github/github.client.js';
import * as repo from './scanner.repository.js';
import type { GitHubRelease } from '../github/github.client.js';

function release(tag: string): GitHubRelease {
  return {
    tag_name: tag,
    name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    published_at: '2024-01-01T00:00:00Z',
    draft: false,
    prerelease: false,
  };
}

// ─── findNewReleases (pure function) ────────────────────

describe('findNewReleases', () => {
  it('returns empty array for no releases', () => {
    expect(findNewReleases([], null)).toEqual([]);
  });

  it('returns only newest when lastSeenTag is null', () => {
    const releases = [release('v3'), release('v2'), release('v1')];
    const result = findNewReleases(releases, null);
    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v3');
  });

  it('returns empty when lastSeenTag is the newest', () => {
    const releases = [release('v3'), release('v2'), release('v1')];
    expect(findNewReleases(releases, 'v3')).toEqual([]);
  });

  it('returns releases newer than lastSeenTag', () => {
    const releases = [release('v3'), release('v2'), release('v1')];
    const result = findNewReleases(releases, 'v1');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.tag_name)).toEqual(['v3', 'v2']);
  });

  it('returns one release when lastSeenTag is second newest', () => {
    const releases = [release('v3'), release('v2'), release('v1')];
    const result = findNewReleases(releases, 'v2');
    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v3');
  });

  it('returns only newest when lastSeenTag not found in list', () => {
    const releases = [release('v3'), release('v2')];
    const result = findNewReleases(releases, 'v-gone');
    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v3');
  });
});

// ─── scanRepositories ───────────────────────────────────

const mockFetchReleases = vi.mocked(fetchReleases);

const defaultRepo = { id: 1, owner: 'org', repo: 'lib', lastSeenTag: 'v1' };
const defaultSub = { subscriptionId: 10, email: 'a@b.com', unsubscribeToken: 'ut' };

describe('scanRepositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([]);
    vi.mocked(repo.notificationExists).mockResolvedValue(false);
    vi.mocked(repo.createNotification).mockResolvedValue({} as never);
  });

  it('returns zeros when no repos have active subs', async () => {
    const stats = await scanRepositories();
    expect(stats).toEqual({
      reposChecked: 0,
      releasesFound: 0,
      notificationsCreated: 0,
      errorCount: 0,
    });
  });

  it('creates notifications for new releases', async () => {
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([defaultRepo]);
    vi.mocked(repo.getActiveSubscriptionsForRepo).mockResolvedValue([defaultSub]);
    mockFetchReleases.mockResolvedValue([release('v2'), release('v1')]);

    const stats = await scanRepositories();

    expect(stats.reposChecked).toBe(1);
    expect(stats.releasesFound).toBe(1);
    expect(stats.notificationsCreated).toBe(1);
    expect(repo.createNotification).toHaveBeenCalledWith({
      subscriptionId: 10,
      type: 'release',
      releaseTag: 'v2',
    });
    expect(repo.updateRepositoryChecked).toHaveBeenCalledWith(1, 'v2');
  });

  it('creates notifications for multiple new releases × subscribers', async () => {
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([defaultRepo]);
    vi.mocked(repo.getActiveSubscriptionsForRepo).mockResolvedValue([
      defaultSub,
      { subscriptionId: 11, email: 'b@c.com', unsubscribeToken: 'ut2' },
    ]);
    mockFetchReleases.mockResolvedValue([
      release('v3'),
      release('v2'),
      release('v1'),
    ]);

    const stats = await scanRepositories();

    // 2 new releases × 2 subscribers = 4 notifications
    expect(stats.releasesFound).toBe(2);
    expect(stats.notificationsCreated).toBe(4);
  });

  it('skips when no new releases', async () => {
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([defaultRepo]);
    mockFetchReleases.mockResolvedValue([release('v1')]);

    const stats = await scanRepositories();

    expect(stats.releasesFound).toBe(0);
    expect(stats.notificationsCreated).toBe(0);
    expect(repo.getActiveSubscriptionsForRepo).not.toHaveBeenCalled();
  });

  it('skips duplicate notifications', async () => {
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([defaultRepo]);
    vi.mocked(repo.getActiveSubscriptionsForRepo).mockResolvedValue([defaultSub]);
    mockFetchReleases.mockResolvedValue([release('v2'), release('v1')]);
    vi.mocked(repo.notificationExists).mockResolvedValue(true);

    const stats = await scanRepositories();

    expect(stats.notificationsCreated).toBe(0);
    expect(repo.createNotification).not.toHaveBeenCalled();
  });

  it('continues on error and increments errorCount', async () => {
    vi.mocked(repo.getRepositoriesWithActiveSubscriptions).mockResolvedValue([
      defaultRepo,
      { id: 2, owner: 'o2', repo: 'r2', lastSeenTag: 'v1' },
    ]);
    mockFetchReleases
      .mockRejectedValueOnce(new Error('API down'))
      .mockResolvedValueOnce([release('v2'), release('v1')]);
    vi.mocked(repo.getActiveSubscriptionsForRepo).mockResolvedValue([defaultSub]);

    const stats = await scanRepositories();

    expect(stats.errorCount).toBe(1);
    expect(stats.reposChecked).toBe(2);
    expect(stats.notificationsCreated).toBe(1);
  });
});
