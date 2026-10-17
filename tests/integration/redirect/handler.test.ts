import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import { pgCreateLinkStore } from '../../../src/shortener/adapters/persistence/idempotency-repository.js';
import { pgDatabase } from '../../../src/shortener/adapters/persistence/pg-database.js';
import { pgAnalyticsStore, pgCaptureFailureAuditor, pgResolveStore } from '../../../src/shortener/adapters/persistence/redirect-repository.js';
import type { ResolveStore } from '../../../src/shortener/app/resolve-link/service.js';
import type { AnalyticsStore } from '../../../src/shortener/domain/analytics/capture.js';
import { buildServer } from '../../../src/server.js';
import { startPostgres, type TestPostgres } from '../../support/postgres.js';

// Real Fastify + real PostgreSQL 16.2 (T003 schema, shortener_app role).
const START = '2026-12-01T00:00:00Z';
const CODE = 'Ab3Zz09';
const DEST = 'https://example.com/landing?x=1';

let pgc: TestPostgres;
let admin: pg.Client;
let clock: SimulatedClock;
let app: ReturnType<typeof buildServer>;

const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows as pg.QueryResultRow[];
const count = async (table: string, where = 'true') => (await q(`select count(*)::int as n from ${table} where ${where}`))[0]!.n as number;
const counter = async (code = CODE) => ((await q('select redirect_count from redirect_counters where short_code=$1', [code]))[0]?.redirect_count as number | undefined) ?? 0;

function makeServer(o: { store?: ResolveStore; analytics?: AnalyticsStore; captureTimeoutMs?: number } = {}) {
  const db = pgDatabase(pgc.config);
  return buildServer({
    logLevel: 'silent',
    createLink: { store: pgCreateLinkStore(db, clock), clock, publicBaseUrl: 'https://sho.rt', resolveClient: async () => 'c1' },
    resolveLink: {
      store: o.store ?? pgResolveStore(db),
      analytics: o.analytics ?? pgAnalyticsStore(db),
      onCaptureFailure: pgCaptureFailureAuditor(db, clock),
      clock,
      captureTimeoutMs: o.captureTimeoutMs,
    },
  });
}

const link = (code: string, url: string, expires: string) =>
  q("insert into short_links(short_code, normalized_url, creator_client_id, created_at, expires_at, expiry_source) values ($1,$2,'c1',$3,$4,'SUPPLIED')", [code, url, START, expires]);
const get = (path: string, method: 'GET' | 'HEAD' = 'GET') => app.inject({ method, url: path });
const stripId = (body: string) => ({ ...JSON.parse(body), request_id: '<id>' });

beforeAll(async () => {
  pgc = await startPostgres(`t009-${process.pid}`);
  admin = new pg.Client(pgc.config);
  await admin.connect();
  await q("insert into clients(client_id, ip_hash) values ('c1','h1')");
}, 150_000);

afterAll(async () => {
  await admin?.end();
  pgc?.stop();
});

beforeEach(async () => {
  await q('delete from redirect_events');
  await q('delete from redirect_counters');
  await q('delete from idempotency_records');
  await q('delete from short_links');
  await q('delete from app_audit_events').catch(() => {}); // INSERT-only for the role: left in place, tests filter by code
  clock = new SimulatedClock(START);
  app = makeServer();
});

describe('T009 redirect (FR-008, DEC-011)', () => {
  it('[FR-008] a valid, unexpired code answers 302 to the stored destination with Cache-Control: no-store', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    const res = await get(`/${CODE}`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(DEST);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toBe('');
  });

  it('[FR-008] the destination is exactly the stored normalized URL, query included', async () => {
    await link(CODE, 'https://example.com/a/b?q=1&r=%7e', '2026-12-31T00:00:00Z');
    expect((await get(`/${CODE}`)).headers.location).toBe('https://example.com/a/b?q=1&r=%7e');
  });

  it('[FR-008] non-ASCII characters stored in the path are percent-encoded (UTF-8) on the wire; ASCII is untouched', async () => {
    await link(CODE, 'https://example.com/日本/ok?x=é', '2026-12-31T00:00:00Z');
    expect((await get(`/${CODE}`)).headers.location).toBe('https://example.com/%E6%97%A5%E6%9C%AC/ok?x=%C3%A9');
  });

  it('[FR-008] case-sensitive end to end: a link created through POST resolves, and its lower-cased code does not', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/links', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ url: DEST }) });
    const code = created.json().short_code as string;
    expect((await get(`/${code}`)).statusCode).toBe(302);
    if (code.toLowerCase() !== code) expect((await get(`/${code.toLowerCase()}`)).statusCode).toBe(404);
  });

  it('[ADR-016] operational routes still win over the code route', async () => {
    expect((await get('/healthz')).statusCode).toBe(200);
    expect((await get('/metrics')).statusCode).toBe(200);
  });
});

describe('T009 not found is identical for unknown and malformed (FR-009, ADR-017)', () => {
  const MALFORMED = ['abc', 'Ab3Zz0', 'Ab3Zz098', 'Ab3Zz0!', 'Ab3Zz0%C3%A9', 'Ab3-Zz0', `${'a'.repeat(64)}`, `${'a'.repeat(200)}`, `${'a'.repeat(5000)}`, 'Ab3Zz09.html'];

  it('[FR-009] unknown well-formed and malformed codes get the same 404 problem (only request_id differs)', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    const unknown = await get('/Zz9Zz99');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.headers['content-type']).toMatch(/^application\/problem\+json/);
    const reference = stripId(unknown.body);
    expect(reference).toEqual({ type: 'urn:urlshort:problem:not_found', title: 'Not found', status: 404, reason: 'not_found', request_id: '<id>' });
    for (const bad of MALFORMED) {
      const res = await get(`/${bad}`);
      expect(res.statusCode, bad).toBe(404);
      expect(res.headers['content-type'], bad).toBe(unknown.headers['content-type']);
      expect(stripId(res.body), bad).toEqual(reference);
    }
  });

  it('[FR-009] the case-flipped code of an existing link is not found', async () => {
    await link('AbCdEfG', DEST, '2026-12-31T00:00:00Z');
    expect((await get('/abcdefg')).statusCode).toBe(404);
    expect((await get('/AbCdEfG')).statusCode).toBe(302);
  });

  it('[FR-009] the 404 never echoes the requested code', async () => {
    const res = await get('/Zz9Zz99');
    expect(res.body).not.toContain('Zz9Zz99');
  });

  it('[ADR-017] a malformed code never reaches the database', async () => {
    let lookups = 0;
    const inner = pgResolveStore(pgDatabase(pgc.config));
    app = makeServer({ store: { findLink: (c) => (lookups++, inner.findLink(c)) } });
    for (const bad of MALFORMED) await get(`/${bad}`);
    expect(lookups).toBe(0);
    await get('/Zz9Zz99');
    expect(lookups).toBe(1);
  });
});

describe('T009 expiry (FR-010, FR-011, DEC-006)', () => {
  it('[DEC-006] an expired link answers 410 link_expired, distinct from 404', async () => {
    await link(CODE, DEST, '2026-11-30T00:00:00Z');
    const res = await get(`/${CODE}`);
    expect(res.statusCode).toBe(410);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(stripId(res.body)).toEqual({ type: 'urn:urlshort:problem:link_expired', title: 'Link expired', status: 410, reason: 'link_expired', request_id: '<id>' });
    expect(res.headers.location).toBeUndefined();
  });

  it('[FR-011] one comparison rule: active one millisecond before the instant, expired from the instant on', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    clock.set('2026-12-30T23:59:59.999Z');
    expect((await get(`/${CODE}`)).statusCode).toBe(302);
    clock.set('2026-12-31T00:00:00Z');
    expect((await get(`/${CODE}`)).statusCode).toBe(410);
    clock.set('2026-12-31T00:00:00.001Z');
    expect((await get(`/${CODE}`)).statusCode).toBe(410);
  });

  it('[FR-011] 50 concurrent resolutions at the boundary all agree', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    clock.set('2026-12-31T00:00:00Z');
    const at = await Promise.all(Array.from({ length: 50 }, () => get(`/${CODE}`)));
    expect(new Set(at.map((r) => r.statusCode))).toEqual(new Set([410]));
    clock.set('2026-12-30T23:59:59.999Z');
    const before = await Promise.all(Array.from({ length: 50 }, () => get(`/${CODE}`)));
    expect(new Set(before.map((r) => r.statusCode))).toEqual(new Set([302]));
  });

  it('[DEC-006][FR-010] a default-expiry link made through POST is active for 30 days, then 410', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/links', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ url: DEST }) });
    const code = created.json().short_code as string;
    clock.set('2026-12-30T23:59:59.999Z');
    expect((await get(`/${code}`)).statusCode).toBe(302);
    clock.set('2026-12-31T00:00:00Z');
    expect((await get(`/${code}`)).statusCode).toBe(410);
  });

  it('[FR-006] an expired code is still gone, never reassigned or reported as unknown', async () => {
    await link(CODE, DEST, '2026-11-30T00:00:00Z');
    expect((await get(`/${CODE}`)).statusCode).toBe(410);
    expect((await get(`/${CODE}`)).statusCode).toBe(410);
  });
});

describe('T009 analytics on successful redirects (FR-012, FR-013, DEC-007, DEC-104, ADR-025)', () => {
  it('[FR-012] each successful GET adds one event (Clock timestamp) and increments the counter in step', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    clock.set('2026-12-02T03:04:05.250Z');
    for (let i = 0; i < 3; i++) await get(`/${CODE}`);
    expect(await counter()).toBe(3);
    const events = await q('select short_code, occurred_at from redirect_events');
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.short_code).toBe(CODE);
      expect(e.occurred_at.toISOString()).toBe('2026-12-02T03:04:05.250Z');
    }
  });

  it('[FR-013] events carry no field besides the code and the timestamp', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    await get(`/${CODE}`);
    const cols = (await q("select column_name from information_schema.columns where table_name='redirect_events' order by column_name")).map((r) => r.column_name);
    expect(cols).toEqual(['event_id', 'occurred_at', 'short_code']);
  });

  it('[ADR-025] 404, 410 and HEAD requests are not counted', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    await link('Old0001', DEST, '2026-11-30T00:00:00Z');
    await get('/Zz9Zz99');
    await get('/Old0001');
    const head = await get(`/${CODE}`, 'HEAD');
    expect(head.statusCode).toBe(302);
    expect(await counter()).toBe(0);
    expect(await counter('Old0001')).toBe(0);
    expect(await count('redirect_events')).toBe(0);
  });

  it('[FR-017] 20 concurrent redirects count exactly 20 (counter equals successful redirects)', async () => {
    await link(CODE, DEST, '2026-12-31T00:00:00Z');
    const rs = await Promise.all(Array.from({ length: 20 }, () => get(`/${CODE}`)));
    expect(rs.every((r) => r.statusCode === 302)).toBe(true);
    expect(await counter()).toBe(20);
    expect(await count('redirect_events')).toBe(20);
  });

  const auditFor = async (code: string) => {
    for (let i = 0; i < 40; i++) {
      const rows = await q("select * from app_audit_events where action='analytics_capture_failed' and subject=$1", [code]);
      if (rows.length > 0) return rows;
      await new Promise((r) => setTimeout(r, 50));
    }
    return [];
  };

  it('[FR-014] a failing analytics store never blocks the redirect: 302, mapping intact, failure audited without error text', async () => {
    await link('Fail001', DEST, '2026-12-31T00:00:00Z');
    app = makeServer({
      analytics: {
        recordRedirect: async () => {
          throw new Error('connection terminated: password=hunter2');
        },
      },
    });
    const res = await get('/Fail001');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(DEST);
    expect(await count('short_links', "short_code='Fail001'")).toBe(1);
    expect(await counter('Fail001')).toBe(0);
    const audit = await auditFor('Fail001');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'analytics_capture_failed', subject: 'Fail001', result: 'FAILURE', reason: 'error' });
    expect(typeof audit[0]!.request_id).toBe('string');
    expect(JSON.stringify(audit[0])).not.toContain('hunter2');
  });

  it('[PVT-010] a hanging analytics store is abandoned at the configured bound: 302 and a timeout audit event', async () => {
    await link('Slow001', DEST, '2026-12-31T00:00:00Z');
    app = makeServer({ analytics: { recordRedirect: () => new Promise<void>(() => {}) }, captureTimeoutMs: 100 });
    const started = Date.now();
    const res = await get('/Slow001');
    expect(res.statusCode).toBe(302);
    expect(Date.now() - started).toBeLessThan(5_000);
    const audit = await auditFor('Slow001');
    expect(audit[0]).toMatchObject({ reason: 'timeout' });
  });
});

describe('T009 persistence failures (FR-008)', () => {
  it('[FR-008] a transient lookup failure -> 503 persistence_unavailable with Retry-After, no leak', async () => {
    app = makeServer({ store: { findLink: async () => { throw Object.assign(new Error('terminating connection password=hunter2'), { code: '57P01' }); } } });
    const res = await get(`/${CODE}`);
    expect(res.statusCode).toBe(503);
    expect(res.json().reason).toBe('persistence_unavailable');
    expect(res.headers['retry-after']).toBe('1');
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).not.toContain('hunter2');
  });

  it('[FR-008] an unexpected lookup failure -> 500 internal_error, no leak', async () => {
    app = makeServer({ store: { findLink: async () => { throw new Error('bug: password=hunter2'); } } });
    const res = await get(`/${CODE}`);
    expect(res.statusCode).toBe(500);
    expect(res.json().reason).toBe('internal_error');
    expect(res.body).not.toContain('hunter2');
  });
});
