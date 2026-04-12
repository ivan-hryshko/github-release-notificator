import { describe, it, expect, vi, beforeEach } from 'vitest';

let cronCallback: () => Promise<void>;

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((_interval: string, cb: () => Promise<void>) => {
      cronCallback = cb;
      return { stop: vi.fn() };
    }),
  },
}));

vi.mock('./scanner.service.js', () => ({
  scanRepositories: vi.fn(),
}));

vi.mock('./scanner.repository.js', () => ({
  createScanJob: vi.fn(),
  updateScanJob: vi.fn(),
}));

vi.mock('../common/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../config/env.js', () => ({
  env: { SCAN_INTERVAL: '*/5 * * * *' },
}));

import { startScannerCron } from './scanner.cron.js';
import { scanRepositories } from './scanner.service.js';
import { createScanJob, updateScanJob } from './scanner.repository.js';
import { logger } from '../common/logger.js';

const mockCreateScanJob = vi.mocked(createScanJob);
const mockUpdateScanJob = vi.mocked(updateScanJob);
const mockScanRepositories = vi.mocked(scanRepositories);

describe('startScannerCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateScanJob.mockResolvedValue({ id: 1 } as never);
    mockUpdateScanJob.mockResolvedValue(undefined as never);
    mockScanRepositories.mockResolvedValue({
      reposChecked: 0,
      releasesFound: 0,
      notificationsCreated: 0,
      errorCount: 0,
    });
    // Reset the module to clear isScanning state
    startScannerCron();
  });

  it('creates scan job and updates with completed status on success', async () => {
    const stats = {
      reposChecked: 2,
      releasesFound: 1,
      notificationsCreated: 3,
      errorCount: 0,
    };
    mockScanRepositories.mockResolvedValue(stats);

    await cronCallback();

    expect(mockCreateScanJob).toHaveBeenCalled();
    expect(mockUpdateScanJob).toHaveBeenCalledWith(1, {
      status: 'completed',
      ...stats,
      finishedAt: expect.any(Date),
    });
    expect(logger.info).toHaveBeenCalledWith(stats, 'Scan completed');
  });

  it('updates scan job with failed status when scanRepositories throws', async () => {
    mockScanRepositories.mockRejectedValue(new Error('scan boom'));

    await cronCallback();

    expect(mockUpdateScanJob).toHaveBeenCalledWith(1, {
      status: 'failed',
      errorMessage: 'scan boom',
      finishedAt: expect.any(Date),
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Scan failed',
    );
  });

  it('does not call updateScanJob when createScanJob fails (DB down)', async () => {
    mockCreateScanJob.mockRejectedValue(new Error('DB connection refused'));

    await cronCallback();

    expect(mockUpdateScanJob).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Scan failed',
    );
  });

  it('resets isScanning flag after createScanJob failure', async () => {
    mockCreateScanJob.mockRejectedValue(new Error('DB down'));

    await cronCallback();

    // Should be able to run again (isScanning was reset)
    mockCreateScanJob.mockResolvedValue({ id: 2 } as never);
    await cronCallback();

    expect(mockCreateScanJob).toHaveBeenCalledTimes(2);
  });

  it('skips scan when already scanning', async () => {
    // Make createScanJob hang to simulate an in-progress scan
    let resolveScan!: () => void;
    mockCreateScanJob.mockImplementation(
      () => new Promise((resolve) => { resolveScan = () => resolve({ id: 1 } as never); }),
    );

    const firstRun = cronCallback();
    await cronCallback(); // second call should skip

    expect(logger.warn).toHaveBeenCalledWith('Scanner already running, skipping');

    resolveScan();
    await firstRun;
  });
});
