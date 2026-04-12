# ADR-005: Robust Redis Singleton Initialization

**Status:** Accepted
**Author:** Ivan Hryshko
**Date:** 2026-04-12

---

## Context

The initial `getRedis()` implementation returned a Redis instance **before** the connection was established. The `connect()` call was fire-and-forget — if it failed, the `.catch()` handler set the global reference to `null`, but callers who already received the instance were left holding a broken object.

This is an **Async Singleton Race Condition**:

1. First call creates the instance, starts `connect()`, returns the instance immediately
2. Caller begins using it (ioredis queues commands while connecting)
3. `connect()` rejects — global `redis` is set to `null`
4. Caller still holds a reference to the dead instance — commands timeout instead of failing fast
5. Concurrent callers during the connection window all get the same broken reference

Consequences: zombie TCP connections, latency spikes from internal ioredis timeouts, and potential memory leaks from unreferenced instances still retrying in the background.

## Decision

Replace the synchronous `getRedis()` with an **async Promise-guarded singleton**. The pattern stores the connection `Promise` itself (not the instance), ensuring:

- All concurrent callers await the **same** connection attempt
- No caller receives an instance until `connect()` resolves
- On failure, the promise is cleared so the next call retries fresh
- No zombie instances — either you get a connected client or `null`

```typescript
let redis: Redis | null = null;
let connectionPromise: Promise<Redis | null> | null = null;

export async function getRedis(): Promise<Redis | null> {
  if (redis) return redis;              // Already connected
  if (connectionPromise) return connectionPromise;  // Connection in progress
  connectionPromise = (async () => { ... await instance.connect() ... })();
  return connectionPromise;
}
```

## Consequences

**Positive:**
- Eliminates race condition — no caller gets a broken instance
- Concurrent calls during connection share the same promise (no duplicate connections)
- Failed connections are retried on next call (connectionPromise is cleared)
- Cleaner shutdown — `disconnectRedis()` clears both instance and promise

**Negative:**
- `getRedis()` is now async — callers must `await` it
- Minimal impact: both callers (`getCached`, `setCache`) were already async functions

**Trade-off:**
- The first request that triggers Redis connection will wait for the TCP handshake (~5-50ms). Subsequent requests get the cached instance immediately. This is acceptable since the alternative was silently returning broken instances.
