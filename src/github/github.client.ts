import { logger } from '../common/logger.js';
import { env } from '../config/env.js';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
}

interface RateLimitState {
  remaining: number;
  resetAt: number;
}

const rateLimit: RateLimitState = {
  remaining: 5000,
  resetAt: 0,
};

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'github-release-notificator',
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return headers;
}

function updateRateLimit(response: Response): void {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (remaining) rateLimit.remaining = parseInt(remaining, 10);
  if (reset) rateLimit.resetAt = parseInt(reset, 10);
}

async function waitForRateLimit(): Promise<void> {
  if (rateLimit.remaining > 10) return;

  const waitMs = rateLimit.resetAt * 1000 - Date.now();
  if (waitMs > 0) {
    logger.warn({ waitMs, resetAt: rateLimit.resetAt }, 'Rate limit low, waiting');
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60000)));
  }
}

async function githubFetch(path: string): Promise<Response> {
  await waitForRateLimit();

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: getHeaders(),
  });

  updateRateLimit(response);

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
    logger.warn({ waitMs }, 'GitHub 429 rate limited, retrying');
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return githubFetch(path);
  }

  return response;
}

export async function checkRepoExists(owner: string, repo: string): Promise<boolean> {
  const response = await githubFetch(`/repos/${owner}/${repo}`);
  return response.status === 200;
}

export async function fetchReleases(
  owner: string,
  repo: string,
  perPage = 30,
): Promise<GitHubRelease[]> {
  const response = await githubFetch(
    `/repos/${owner}/${repo}/releases?per_page=${perPage}`,
  );

  if (response.status === 404) return [];
  if (!response.ok) {
    logger.error({ status: response.status, owner, repo }, 'GitHub API error fetching releases');
    return [];
  }

  const releases: GitHubRelease[] = await response.json();
  return releases.filter((r) => !r.draft && !r.prerelease);
}

export async function fetchLatestRelease(
  owner: string,
  repo: string,
): Promise<GitHubRelease | null> {
  const releases = await fetchReleases(owner, repo, 1);
  return releases[0] ?? null;
}

export function getRateLimitState(): RateLimitState {
  return { ...rateLimit };
}
