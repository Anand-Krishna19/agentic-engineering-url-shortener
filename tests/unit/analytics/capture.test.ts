import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import {
  CAPTURE_TIMEOUT_MS,
  captureRedirect,
  type AnalyticsStore,
  type CaptureFailure,
  type RedirectEvent,
} from '../../../src/shortener/domain/analytics/capture.js';

const NOW = '2026-10-17T10:00:00.250Z';

function harness(record: AnalyticsStore['recordRedirect']) {
  const calls: RedirectEvent[] = [];
  const failures: CaptureFailure[] = [];
  const store: AnalyticsStore = {
    recordRedirect: (e, signal) => {
      calls.push(e);
      return record(e, signal);
    },
  };
  const clock = new SimulatedClock(NOW);
  const run = (method = 'GET', code = 'Ab3Zz09') =>
    captureRedirect({ store, clock, onFailure: (f) => void failures.push(f) }, code, method);
  return { calls, failures, run, clock };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('T010 analytics: count and timestamp only (FR-012, FR-013, DEC-007)', () => {
  it('[FR-012] a successful GET redirect records the code and the injected-clock timestamp, once', async () => {
    const h = harness(async () => {});
    await expect(h.run()).resolves.toBe('captured');
    expect(h.calls).toEqual([{ shortCode: 'Ab3Zz09', occurredAt: new Date(NOW) }]);
  });

  it('[FR-013] the recorded event carries no field besides the code and the timestamp', async () => {
    const h = harness(async () => {});
    await h.run();
    expect(Object.keys(h.calls[0]!).sort()).toEqual(['occurredAt', 'shortCode']);
  });

  it('[FR-012][ADR-010] the timestamp comes from the Clock port at the moment of capture', async () => {
    const h = harness(async () => {});
    h.clock.set('2030-01-01T00:00:00Z');
    await h.run();
    expect(h.calls[0]!.occurredAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it.each(['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'])('[ADR-025] %s requests are not counted (DEC-104)', async (method) => {
    const h = harness(async () => {});
    await expect(h.run(method)).resolves.toBe('skipped');
    expect(h.calls).toEqual([]);
    expect(h.failures).toEqual([]);
  });

  it('[ADR-025] the method comparison is case-insensitive', async () => {
    const h = harness(async () => {});
    await expect(h.run('get')).resolves.toBe('captured');
  });
});

describe('T010 analytics fails open with a single attempt (FR-014, ADR-025, DEC-097, DEC-109)', () => {
  it('[FR-014] a store failure never rejects: the redirect can still proceed', async () => {
    const h = harness(async () => {
      throw new Error('connection terminated: password=hunter2');
    });
    await expect(h.run()).resolves.toBe('failed');
  });

  it('[FR-014] a synchronous throw from the store is also contained', async () => {
    const h = harness(() => {
      throw new Error('boom');
    });
    await expect(h.run()).resolves.toBe('failed');
  });

  it('[ADR-025] exactly one attempt: a failure is never retried', async () => {
    const h = harness(async () => {
      throw new Error('boom');
    });
    await h.run();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toHaveLength(1);
  });

  it('[FR-014] the failure is reported once, with the code and a reason, and without the error text', async () => {
    const h = harness(async () => {
      throw new Error('connection terminated: password=hunter2');
    });
    await h.run();
    expect(h.failures).toEqual([{ shortCode: 'Ab3Zz09', reason: 'error' }]);
    expect(JSON.stringify(h.failures)).not.toContain('hunter2');
  });

  it('[FR-014] a failing failure reporter cannot break the redirect either', async () => {
    const store: AnalyticsStore = {
      recordRedirect: async () => {
        throw new Error('boom');
      },
    };
    const out = captureRedirect(
      {
        store,
        clock: new SimulatedClock(NOW),
        onFailure: () => {
          throw new Error('audit sink down');
        },
      },
      'Ab3Zz09',
      'GET',
    );
    await expect(out).resolves.toBe('failed');
  });

  it('[FR-014] success reports no failure', async () => {
    const h = harness(async () => {});
    await h.run();
    expect(h.failures).toEqual([]);
  });
});

describe('T010 analytics is bounded by the 10 s persistence attempt timeout (PVT-010, ADR-025)', () => {
  it('[PVT-010] the bound is 10 seconds', () => {
    expect(CAPTURE_TIMEOUT_MS).toBe(10_000);
  });

  it('[PVT-010] a store that never answers is abandoned at 10 s and reported as a timeout', async () => {
    const h = harness(() => new Promise<void>(() => {}));
    let settled = false;
    const p = h.run().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('failed');
    expect(h.failures).toEqual([{ shortCode: 'Ab3Zz09', reason: 'timeout' }]);
    expect(h.calls).toHaveLength(1);
  });

  it('[PVT-010] the store is handed an abort signal that fires on timeout', async () => {
    let seen: AbortSignal | undefined;
    const h = harness((_e, signal) => {
      seen = signal;
      return new Promise<void>(() => {});
    });
    const p = h.run();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(seen?.aborted).toBe(true);
  });

  it('[ADR-025] a late success after the timeout adds no second report and no retry', async () => {
    let finish: () => void = () => {};
    const h = harness(() => new Promise<void>((res) => (finish = res)));
    const p = h.run();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    finish();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.failures).toHaveLength(1);
    expect(h.calls).toHaveLength(1);
  });

  it('[PVT-010] a fast success leaves no pending timer behind', async () => {
    const h = harness(async () => {});
    await h.run();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('[PVT-010] the timeout can be overridden for the persistence attempt setting', async () => {
    const store: AnalyticsStore = { recordRedirect: () => new Promise<void>(() => {}) };
    const failures: CaptureFailure[] = [];
    const p = captureRedirect({ store, clock: new SimulatedClock(NOW), timeoutMs: 500, onFailure: (f) => void failures.push(f) }, 'Ab3Zz09', 'GET');
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe('failed');
    expect(failures[0]!.reason).toBe('timeout');
  });
});
