import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn();
const mockQuit = vi.fn();
const mockOn = vi.fn();

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    connect: mockConnect,
    quit: mockQuit,
    on: mockOn,
  })),
}));

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn() },
}));

async function loadModule() {
  return import('./redis.js');
}

describe('getRedis', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockQuit.mockResolvedValue(undefined);
  });

  it('returns a connected Redis instance on success', async () => {
    const { getRedis } = await loadModule();
    const redis = await getRedis();
    expect(redis).not.toBeNull();
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('returns the same instance on subsequent calls', async () => {
    const { getRedis } = await loadModule();
    const first = await getRedis();
    const second = await getRedis();
    expect(first).toBe(second);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('returns null when connect() fails', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));
    const { getRedis } = await loadModule();
    const redis = await getRedis();
    expect(redis).toBeNull();
  });

  it('concurrent calls share the same promise', async () => {
    let resolveConnect!: () => void;
    mockConnect.mockImplementation(
      () => new Promise<void>((resolve) => { resolveConnect = resolve; }),
    );

    const { getRedis } = await loadModule();
    const p1 = getRedis();
    const p2 = getRedis();

    resolveConnect();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('retries connection after a failure', async () => {
    mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { getRedis } = await loadModule();

    const first = await getRedis();
    expect(first).toBeNull();

    mockConnect.mockResolvedValueOnce(undefined);
    const second = await getRedis();
    expect(second).not.toBeNull();
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('disconnectRedis clears instance and promise', async () => {
    const { getRedis, disconnectRedis } = await loadModule();

    const redis = await getRedis();
    expect(redis).not.toBeNull();

    await disconnectRedis();
    expect(mockQuit).toHaveBeenCalledOnce();

    // After disconnect, next getRedis creates a new connection
    const redis2 = await getRedis();
    expect(redis2).not.toBeNull();
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
