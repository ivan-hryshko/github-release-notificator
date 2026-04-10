import { logger } from '../common/logger.js';
import { fetchReleases, type GitHubRelease } from '../github/github.client.js';
import {
  getRepositoriesWithActiveSubscriptions,
  getActiveSubscriptionsForRepo,
  notificationExists,
  createNotification,
  updateRepositoryChecked,
} from './scanner.repository.js';

interface ScanStats {
  reposChecked: number;
  releasesFound: number;
  notificationsCreated: number;
  errorCount: number;
}

export function findNewReleases(
  releases: GitHubRelease[],
  lastSeenTag: string | null,
): GitHubRelease[] {
  if (releases.length === 0) return [];

  if (!lastSeenTag) return [releases[0]];

  const idx = releases.findIndex((r) => r.tag_name === lastSeenTag);

  if (idx === -1) return [releases[0]];
  if (idx === 0) return [];

  return releases.slice(0, idx);
}

async function createNotificationsForRelease(
  release: GitHubRelease,
  subs: Awaited<ReturnType<typeof getActiveSubscriptionsForRepo>>,
): Promise<number> {
  let created = 0;

  for (const sub of subs) {
    const exists = await notificationExists(sub.subscriptionId, release.tag_name);
    if (exists) continue;

    await createNotification({
      subscriptionId: sub.subscriptionId,
      type: 'release',
      releaseTag: release.tag_name,
    });
    created++;
  }

  return created;
}

export async function scanRepositories(): Promise<ScanStats> {
  const stats: ScanStats = {
    reposChecked: 0,
    releasesFound: 0,
    notificationsCreated: 0,
    errorCount: 0,
  };

  const repos = await getRepositoriesWithActiveSubscriptions();

  for (const repo of repos) {
    try {
      stats.reposChecked++;
      const releases = await fetchReleases(repo.owner, repo.repo);
      const newReleases = findNewReleases(releases, repo.lastSeenTag);

      if (newReleases.length === 0) continue;

      stats.releasesFound += newReleases.length;
      const subs = await getActiveSubscriptionsForRepo(repo.id);

      for (const release of newReleases) {
        stats.notificationsCreated += await createNotificationsForRelease(release, subs);
      }

      await updateRepositoryChecked(repo.id, newReleases[0].tag_name);
    } catch (err) {
      stats.errorCount++;
      logger.error(
        { err, owner: repo.owner, repo: repo.repo },
        'Error scanning repository',
      );
    }
  }

  return stats;
}
