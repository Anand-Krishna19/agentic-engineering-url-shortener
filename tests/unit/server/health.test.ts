import { describe, expect, it } from 'vitest';
import { buildServer, start } from '../../../src/server.js';

/** Collects pino JSON lines so tests can assert on log structure (NFR-005). */
function logCapture() {
  const lines: string[] = [];
  return {
    stream: { write: (s: string) => void lines.push(s) },
    records: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
    raw: () => lines.join(''),
  };
}

describe('T004 Fastify skeleton: operations endpoints', () => {
  it('[FR-021] GET /healthz returns 200 {"status":"alive"} and nothing else', async () => {
    const app = buildServer({ logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.json()).toEqual({ status: 'alive' });
  });

  it('[FR-021] GET /readyz is ready with named dependency states when all checks pass', async () => {
    const app = buildServer({ logLevel: 'silent', readinessChecks: { persistence: async () => true } });
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { persistence: 'ok' } });
  });

  it('[FR-021] GET /readyz returns 503 not_ready when a check fails, without leaking error detail', async () => {
    const app = buildServer({
      logLevel: 'silent',
      readinessChecks: {
        persistence: async () => false,
        cache: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:6379 password=hunter2');
        },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not_ready', checks: { persistence: 'failed', cache: 'failed' } });
    expect(res.body).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/);
  });

  it('[FR-021] liveness stays accurate when the service is not ready', async () => {
    const app = buildServer({ logLevel: 'silent', readinessChecks: { persistence: async () => false } });
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'alive' });
  });

  it('[FR-021] GET /readyz with no registered checks reports ready with an empty checks map', async () => {
    const res = await buildServer({ logLevel: 'silent' }).inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: {} });
  });

  it('[FR-021] GET /metrics returns Prometheus text exposition (T004 stub, no collectors)', async () => {
    const res = await buildServer({ logLevel: 'silent' }).inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    for (const line of res.body.split('\n').filter((l) => l.trim() !== '')) {
      expect(line, line).toMatch(/^(#|[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? [-+0-9.eE]+( \d+)?$)/);
    }
  });

  it('[FR-021] unknown paths are not served by the skeleton', async () => {
    const res = await buildServer({ logLevel: 'silent' }).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(404);
  });
});

describe('T004 Fastify skeleton: listening', () => {
  it('[ADR-023] start() binds to loopback by default and serves /healthz over real HTTP', async () => {
    const app = await start({ port: 0, logLevel: 'silent' });
    try {
      const addr = app.server.address();
      expect(addr && typeof addr === 'object' ? addr.address : '').toBe('127.0.0.1');
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'alive' });
    } finally {
      await app.close();
    }
  });
});

describe('T004 Fastify skeleton: contract-first Ajv settings (ADR-002)', () => {
  const schema = {
    body: {
      type: 'object',
      required: ['n'],
      additionalProperties: false,
      properties: { n: { type: 'integer' }, d: { type: 'string', default: 'injected' } },
    },
  };
  const makeApp = () => {
    const app = buildServer({ logLevel: 'silent' });
    app.post('/_t', { schema }, async (req) => req.body);
    return app;
  };

  it('[ADR-002] coerceTypes is false: a numeric string is rejected, not coerced', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/_t', payload: { n: '5' } });
    expect(res.statusCode).toBe(400);
  });

  it('[ADR-002] removeAdditional is false: unknown properties are rejected, not stripped', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/_t', payload: { n: 5, extra: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it('[ADR-002] useDefaults is false: schema defaults are not injected', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/_t', payload: { n: 5 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ n: 5 });
  });
});

describe('T004 Fastify skeleton: structured logging with correlation IDs (NFR-005, ADR-008)', () => {
  it('[NFR-005] every request log line is JSON and carries a request_id', async () => {
    const cap = logCapture();
    const app = buildServer({ logStream: cap.stream, logLevel: 'info' });
    await app.inject({ method: 'GET', url: '/healthz' });
    const recs = cap.records().filter((r) => r['req'] !== undefined || r['res'] !== undefined);
    expect(recs.length).toBeGreaterThanOrEqual(2); // incoming request + completed request
    for (const r of recs) expect(typeof r['request_id']).toBe('string');
    expect(new Set(recs.map((r) => r['request_id'])).size).toBe(1);
  });

  it('[NFR-005] distinct requests get distinct correlation IDs', async () => {
    const cap = logCapture();
    const app = buildServer({ logStream: cap.stream, logLevel: 'info' });
    await app.inject({ method: 'GET', url: '/healthz' });
    await app.inject({ method: 'GET', url: '/healthz' });
    const ids = new Set(cap.records().map((r) => r['request_id']).filter(Boolean));
    expect(ids.size).toBe(2);
  });

  it('[NFR-005] a client-supplied X-Request-Id is not trusted as the correlation ID', async () => {
    const cap = logCapture();
    const app = buildServer({ logStream: cap.stream, logLevel: 'info' });
    await app.inject({ method: 'GET', url: '/healthz', headers: { 'x-request-id': 'attacker-chosen' } });
    expect(cap.raw()).not.toContain('attacker-chosen');
  });

  it('[FR-013][NFR-005] logs never contain the peer address', async () => {
    const cap = logCapture();
    const app = buildServer({ logStream: cap.stream, logLevel: 'info' });
    await app.inject({ method: 'GET', url: '/healthz', remoteAddress: '203.0.113.9' });
    const raw = cap.raw();
    expect(raw).not.toContain('203.0.113.9');
    expect(raw).not.toContain('remoteAddress');
  });

  it('[NFR-005] a failing readiness check is logged with the request_id but without secrets', async () => {
    const cap = logCapture();
    const app = buildServer({
      logStream: cap.stream,
      logLevel: 'info',
      readinessChecks: {
        cache: async () => {
          throw new Error('password=hunter2');
        },
      },
    });
    await app.inject({ method: 'GET', url: '/readyz' });
    const warn = cap.records().find((r) => r['msg'] === 'readiness check failed');
    expect(warn).toBeDefined();
    expect(warn!['check']).toBe('cache');
    expect(typeof warn!['request_id']).toBe('string');
    expect(cap.raw()).not.toContain('hunter2');
  });
});
