import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { API_KEY: undefined as string | undefined },
}));

vi.mock('../config/env.js', () => ({ env: mockEnv }));

import { apiKeyAuth } from './auth.middleware.js';

function createMocks() {
  const req = { headers: {} } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('apiKeyAuth', () => {
  beforeEach(() => {
    mockEnv.API_KEY = undefined;
  });

  it('passes through when API_KEY is not set', () => {
    const { req, res, next } = createMocks();
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through when correct key is provided', () => {
    mockEnv.API_KEY = 'my-secret';
    const { req, res, next } = createMocks();
    req.headers['x-api-key'] = 'my-secret';
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no key is provided', () => {
    mockEnv.API_KEY = 'my-secret';
    const { req, res, next } = createMocks();
    apiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid or missing API key',
    });
  });

  it('returns 401 when wrong key is provided', () => {
    mockEnv.API_KEY = 'my-secret';
    const { req, res, next } = createMocks();
    req.headers['x-api-key'] = 'wrong-key';
    apiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
