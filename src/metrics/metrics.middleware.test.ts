import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockInc, mockStartTimer } = vi.hoisted(() => ({
  mockInc: vi.fn(),
  mockStartTimer: vi.fn(() => vi.fn()),
}));

vi.mock('./metrics.js', () => ({
  httpRequestsTotal: { inc: mockInc },
  httpRequestDuration: { startTimer: mockStartTimer },
}));

import { metricsMiddleware } from './metrics.middleware.js';

function createMockReqRes(method: string, path: string, statusCode: number) {
  const listeners: Record<string, (() => void)[]> = {};

  const req = { method, path } as Request;
  const res = {
    statusCode,
    on(event: string, cb: () => void) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
  } as unknown as Response;

  return {
    req,
    res,
    fireFinish: () => listeners['finish']?.forEach((cb) => cb()),
  };
}

describe('metricsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next immediately', () => {
    const { req, res } = createMockReqRes('GET', '/health', 200);
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('increments counter on response finish', () => {
    const { req, res, fireFinish } = createMockReqRes('POST', '/api/subscribe', 201);
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);
    fireFinish();

    expect(mockInc).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/subscribe',
      status: '201',
    });
  });

  it('records duration histogram on finish', () => {
    const endTimer = vi.fn();
    mockStartTimer.mockReturnValue(endTimer);

    const { req, res, fireFinish } = createMockReqRes('GET', '/health', 200);
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);
    fireFinish();

    expect(endTimer).toHaveBeenCalledWith({ method: 'GET', path: '/health' });
  });

  it('normalizes UUID tokens in path', () => {
    const { req, res, fireFinish } = createMockReqRes(
      'GET',
      '/api/confirm/550e8400-e29b-41d4-a716-446655440000',
      200,
    );
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);
    fireFinish();

    expect(mockInc).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/confirm/:token',
      status: '200',
    });
  });

  it('does not normalize non-UUID path segments', () => {
    const { req, res, fireFinish } = createMockReqRes('GET', '/api/subscriptions', 200);
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);
    fireFinish();

    expect(mockInc).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/subscriptions',
      status: '200',
    });
  });
});
