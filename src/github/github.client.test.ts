import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    GITHUB_TOKEN: undefined as string | undefined,
  },
}));

vi.mock('../config/env.js', () => ({ env: mockEnv }));
vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./github.cache.js', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

import { logger } from '../common/logger.js';

function mockResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): Response {
  const bodyStr = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body ?? {}),
    text: vi.fn().mockResolvedValue(bodyStr),
    headers: new Headers({
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-reset': '9999999999',
      ...headers,
    }),
  } as unknown as Response;
}

// Fresh module import per test group to reset module-level rateLimit state
async function loadClient() {
  const mod = await import('./github.client.js');
  return mod;
}

describe('github.client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockEnv.GITHUB_TOKEN = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('checkRepoExists', () => {
    it('returns true for 200 status', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));
      const { checkRepoExists } = await loadClient();
      expect(await checkRepoExists('owner', 'repo')).toBe(true);
    });

    it('returns false for 404 status', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));
      const { checkRepoExists } = await loadClient();
      expect(await checkRepoExists('owner', 'repo')).toBe(false);
    });

    it('calls correct GitHub API URL', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));
      const { checkRepoExists } = await loadClient();
      await checkRepoExists('my-org', 'my-repo');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'github-release-notificator',
          }),
        }),
      );
    });
  });

  describe('fetchReleases', () => {
    it('returns empty array for 404', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));
      const { fetchReleases } = await loadClient();
      expect(await fetchReleases('o', 'r')).toEqual([]);
    });

    it('returns empty array and logs error for 500', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500));
      const { fetchReleases } = await loadClient();
      expect(await fetchReleases('o', 'r')).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('filters out drafts and prereleases', async () => {
      const releases = [
        { tag_name: 'v1', draft: true, prerelease: false },
        { tag_name: 'v2', draft: false, prerelease: true },
        { tag_name: 'v3', draft: false, prerelease: false },
      ];
      fetchMock.mockResolvedValueOnce(mockResponse(200, releases));
      const { fetchReleases } = await loadClient();
      const result = await fetchReleases('o', 'r');
      expect(result).toHaveLength(1);
      expect(result[0].tag_name).toBe('v3');
    });

    it('passes perPage as query param', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, []));
      const { fetchReleases } = await loadClient();
      await fetchReleases('o', 'r', 5);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('per_page=5'),
        expect.anything(),
      );
    });
  });

  describe('fetchLatestRelease', () => {
    it('returns first release', async () => {
      const release = { tag_name: 'v1.0', draft: false, prerelease: false };
      fetchMock.mockResolvedValueOnce(mockResponse(200, [release]));
      const { fetchLatestRelease } = await loadClient();
      const result = await fetchLatestRelease('o', 'r');
      expect(result).toMatchObject({ tag_name: 'v1.0' });
    });

    it('returns null when no releases', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, []));
      const { fetchLatestRelease } = await loadClient();
      expect(await fetchLatestRelease('o', 'r')).toBeNull();
    });
  });

  describe('auth header', () => {
    it('omits Authorization when no GITHUB_TOKEN', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));
      const { checkRepoExists } = await loadClient();
      await checkRepoExists('o', 'r');
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('includes Bearer token when GITHUB_TOKEN is set', async () => {
      mockEnv.GITHUB_TOKEN = 'ghp_test123';
      fetchMock.mockResolvedValueOnce(mockResponse(200));
      const { checkRepoExists } = await loadClient();
      await checkRepoExists('o', 'r');
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer ghp_test123');
    });
  });

  describe('rate limiting', () => {
    it('updates rate limit state from response headers', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {}, {
          'x-ratelimit-remaining': '42',
          'x-ratelimit-reset': '1700000000',
        }),
      );
      const { checkRepoExists, getRateLimitState } = await loadClient();
      await checkRepoExists('o', 'r');
      const state = getRateLimitState();
      expect(state.remaining).toBe(42);
      expect(state.resetAt).toBe(1700000000);
    });

    it('retries on 429 response', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(429, null, { 'retry-after': '1' }),
        )
        .mockResolvedValueOnce(mockResponse(200));

      const { checkRepoExists } = await loadClient();
      const promise = checkRepoExists('o', 'r');

      // Advance past the 1-second retry-after
      await vi.advanceTimersByTimeAsync(1000);

      expect(await promise).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
