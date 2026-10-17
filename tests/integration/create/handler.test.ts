import { randomInt } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/kernel/clock/clock.js';
import { pgCreateLinkStore } from '../../../src/shortener/adapters/persistence/idempotency-repository.js';
import { pgDatabase } from '../../../src/shortener/adapters/persistence/pg-database.js';
import type { CreateLinkStore } from '../../../src/shortener/app/create-link/service.js';
import { SHORT_CODE_ALPHABET } from '../../../src/shortener/domain/code/generator.js';
import { ABSENT } from '../../../src/shortener/domain/expiry/checker.js';
import { computeSignature } from '../../../src/shortener/domain/idempotency/signature.js';
import { buildServer } from '../../../src/server.js';
import { startPostgres, type TestPostgres } from '../../support/postgres.js';

// Real Fastify + real PostgreSQL 16.2 (T003 schema, shortener_app role). Redis is not involved: PostgreSQL-only
// mode is valid because Redis is only an accelerator (ADR-015, ADR-026, DEC-067).
const START = '2026-12-01T00:00:00Z';
const BASE = 'https://sho.rt';
const URL_A = 'https://example.com/a?x=1';
const CODE = /^[0-9A-Za-z]{7}$/;

let pgc: TestPostgres;
let admin: pg.Client;
let clock: SimulatedClock;
let app: ReturnType<typeof buildServer>;

const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows as pg.QueryResultRow[];
const count = async (table: string, where = 'true') => ((await q(`select count(*)::int as n from ${table} where ${where}`))[0]!.n as number);

function makeServer(opts: { wrap?: (s: CreateLinkStore) => CreateLinkStore; randomInt?: (n: number) => number } = {}) {
  const real = pgCreateLinkStore(pgDatabase(pgc.config), clock, { randomInt: opts.randomInt });
  return buildServer({
    logLevel: 'silent',
    createLink: {
      store: opts.wrap ? opts.wrap(real) : real,
      clock,
      publicBaseUrl: BASE,
      resolveClient: async (req) => String(req.headers['x-test-client']),
    },
  });
}

interface PostOpts { key?: string; client?: string; raw?: string; contentType?: string }
const post = (payload: unknown, o: PostOpts = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/links',
    headers: {
      'content-type': o.contentType ?? 'application/json',
      'x-test-client': o.client ?? 'c1',
      ...(o.key !== undefined ? { 'idempotency-key': o.key } : {}),
    },
    payload: o.raw ?? JSON.stringify(payload),
  });

beforeAll(async () => {
  pgc = await startPostgres(`t008-${process.pid}`);
  admin = new pg.Client(pgc.config);
  await admin.connect();
  await q("insert into clients(client_id, ip_hash) values ('c1','h1'), ('c2','h2')");
}, 150_000);

afterAll(async () => {
  await admin?.end();
  pgc?.stop();
});

beforeEach(async () => {
  await q('delete from idempotency_records');
  await q('delete from short_links');
  clock = new SimulatedClock(START);
  app = makeServer();
});

describe('T008 creation (FR-001, FR-010)', () => {
  it('[FR-001] POST /v1/links creates a link: 201, contract body, persisted with Clock times', async () => {
    const res = await post({ url: URL_A });
    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['idempotency-replayed']).toBeUndefined();
    const b = res.json();
    expect(Object.keys(b).sort()).toEqual(['created_at', 'expires_at', 'original_url', 'short_code', 'short_url']);
    expect(b.short_code).toMatch(CODE);
    expect(b.short_url).toBe(`${BASE}/${b.short_code}`);
    expect(b.original_url).toBe(URL_A);
    expect(b.created_at).toBe('2026-12-01T00:00:00.000Z');
    expect(b.expires_at).toBe('2026-12-31T00:00:00Z'); // default 30 days (FR-010)
    const row = (await q('select * from short_links where short_code=$1', [b.short_code]))[0]!;
    expect(row.normalized_url).toBe(URL_A);
    expect(row.creator_client_id).toBe('c1');
    expect(row.expiry_source).toBe('DEFAULT');
    expect(row.created_at.toISOString()).toBe('2026-12-01T00:00:00.000Z'); // from the Clock port, never now() (ADR-010)
    expect(row.expires_at.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('[FR-002] the stored and returned URL is the normalized form', async () => {
    const res = await post({ url: 'HTTPS://Example.COM:443/Path#frag' });
    expect(res.json().original_url).toBe('https://example.com/Path');
  });

  it('[FR-010] a supplied expiry is stored canonical (UTC) and recorded as SUPPLIED', async () => {
    const res = await post({ url: URL_A, expires_at: '2027-03-01T01:00:00+01:00' });
    expect(res.statusCode).toBe(201);
    expect(res.json().expires_at).toBe('2027-03-01T00:00:00Z');
    expect((await q('select expiry_source from short_links'))[0]!.expiry_source).toBe('SUPPLIED');
  });

  it('[FR-015] the same URL without an Idempotency-Key creates a new, distinct link every time', async () => {
    const a = (await post({ url: URL_A })).json();
    const b = (await post({ url: URL_A })).json();
    expect(a.short_code).not.toBe(b.short_code);
    expect(await count('short_links')).toBe(2);
    expect(await count('idempotency_records')).toBe(0);
  });
});

describe('T008 validation-class rejections never consume a key (DEC-033, DEC-036, FR-003..005, DEC-017, DEC-024)', () => {
  const reject = async (payload: unknown, status: number, reason: string, o: PostOpts = {}) => {
    const res = await post(payload, o);
    expect(res.statusCode, JSON.stringify(payload)).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const b = res.json();
    expect(Object.keys(b).sort()).toEqual(['reason', 'request_id', 'status', 'title', 'type']);
    expect(b.reason).toBe(reason);
    expect(b.type).toBe(`urn:urlshort:problem:${reason}`);
    expect(b.status).toBe(status);
    expect(typeof b.request_id).toBe('string');
    expect(await count('short_links')).toBe(0);
    expect(await count('idempotency_records')).toBe(0); // rejected before any record exists
    return res;
  };

  it.each([
    [{ url: 'not a url' }, 'invalid_url'],
    [{ url: '' }, 'invalid_url'],
    [{ url: 'ftp://example.com/' }, 'unsupported_scheme'],
    [{ url: 'javascript:alert(1)' }, 'unsupported_scheme'],
    [{ url: 'https://user:pw@example.com/' }, 'invalid_url'],
    [{ url: 'https://localhost/' }, 'forbidden_destination'],
    [{ url: 'http://169.254.169.254/' }, 'forbidden_destination'],
    [{ url: `https://example.com/${'a'.repeat(2040)}` }, 'url_too_long'],
    [{ url: 'https://sho.rt/abc' }, 'forbidden_destination'], // self-reference to the public base URL
  ])('[FR-003..005] %j -> 400 %s', async (payload, reason) => {
    await reject(payload, 400, reason, { key: 'k-reject' });
  });

  it('[DEC-033] a key not consumed by a rejection can be reused for the corrected request', async () => {
    await reject({ url: 'not a url' }, 400, 'invalid_url', { key: 'k-fix' });
    const ok = await post({ url: URL_A }, { key: 'k-fix' });
    expect(ok.statusCode).toBe(201);
    expect(ok.headers['idempotency-replayed']).toBeUndefined();
  });

  it.each([
    [{ url: URL_A, expires_at: '2026-12-01T00:00:00Z' }], // == now
    [{ url: URL_A, expires_at: '2026-11-30T23:59:59Z' }],
    [{ url: URL_A, expires_at: '2027-12-01T00:00:01Z' }], // now + 365d + 1 s
  ])('[DEC-017][DEC-024] %j -> 400 expiry_out_of_range', async (payload) => {
    await reject(payload, 400, 'expiry_out_of_range', { key: 'k-exp' });
  });

  it('[DEC-024] now + 365 days exactly is accepted', async () => {
    expect((await post({ url: URL_A, expires_at: '2027-12-01T00:00:00Z' })).statusCode).toBe(201);
  });

  it.each(['ttl_seconds', 'expires_in', 'ttl', 'expires_after', 'expiry_days'])('[DEC-024] relative field %s -> unsupported_expiry_representation', async (field) => {
    await reject({ url: URL_A, [field]: 3600 }, 400, 'unsupported_expiry_representation');
  });

  it('[DEC-024] a relative field wins over other unknown fields (shape check order)', async () => {
    await reject({ url: URL_A, bogus: 1, ttl_seconds: 5 }, 400, 'unsupported_expiry_representation');
  });

  it.each([
    [{ url: URL_A, extra: 'x' }],
    [{}],
    [{ url: 42 }],
    [{ url: null }],
    [{ url: URL_A, expires_at: 'tomorrow' }],
    [{ url: URL_A, expires_at: '2027-01-31T12:00:00' }], // no offset
    [{ url: URL_A, expires_at: 1798718400 }],
    [{ url: URL_A, expires_at: '2027-01-31T12:00:00.1234567Z' }], // PA-010
    [[URL_A]],
  ])('[FR-003] malformed shape %j -> 400 malformed_request', async (payload) => {
    await reject(payload, 400, 'malformed_request');
  });

  it.each([
    ['{"url":', 'application/json'],
    ['', 'application/json'],
    ['null', 'application/json'],
    ['url=x', 'text/plain'],
  ])('[FR-003] unparseable or wrong-type body %j -> 400 malformed_request', async (raw, contentType) => {
    await reject(undefined, 400, 'malformed_request', { raw, contentType });
  });

  it.each(['', ' ', 'has space', 'x'.repeat(129), 'café', 'tab\there'])('[PA-004] Idempotency-Key %j -> 400 invalid_idempotency_key', async (key) => {
    await reject({ url: URL_A }, 400, 'invalid_idempotency_key', { key });
  });

  it('[PA-004] Idempotency-Key boundaries 1 and 128 characters are accepted', async () => {
    expect((await post({ url: URL_A }, { key: 'k' })).statusCode).toBe(201);
    expect((await post({ url: URL_A }, { key: 'k'.repeat(128) })).statusCode).toBe(201);
  });

  it('[FR-019] a rejection never echoes the submitted input', async () => {
    const res = await post({ url: 'https://user:s3cret@example.com/?token=abc' });
    expect(res.body).not.toContain('s3cret');
    expect(res.body).not.toContain('token=abc');
  });
});

describe('T008 idempotency (FR-015, FR-016, DEC-016, DEC-023, DEC-029, DEC-031)', () => {
  it('[FR-015][FR-016] same key and signature replays the stored response with Idempotency-Replayed: true', async () => {
    const a = await post({ url: URL_A }, { key: 'k1' });
    const b = await post({ url: URL_A }, { key: 'k1' });
    expect(a.statusCode).toBe(201);
    expect(a.headers['idempotency-replayed']).toBeUndefined();
    expect(b.statusCode).toBe(201);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.body).toBe(a.body);
    expect(await count('short_links')).toBe(1);
    const rec = (await q('select * from idempotency_records'))[0]!;
    expect(rec.state).toBe('COMPLETED');
    expect(rec.short_code).toBe(a.json().short_code);
    expect(rec.response_status).toBe(201);
    expect(rec.lease_expires_at).toBeNull();
    expect(rec.terminal_at.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(rec.retention_until.toISOString()).toBe('2026-12-02T00:00:00.000Z'); // terminal + 24 h (DEC-031)
  });

  it('[DEC-016] same key with a different URL or expiry -> 409 idempotency_key_conflict, nothing created', async () => {
    await post({ url: URL_A }, { key: 'k2' });
    for (const payload of [{ url: 'https://example.com/other' }, { url: URL_A, expires_at: '2027-03-01T00:00:00Z' }]) {
      const res = await post(payload, { key: 'k2' });
      expect(res.statusCode).toBe(409);
      expect(res.json().reason).toBe('idempotency_key_conflict');
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    }
    expect(await count('short_links')).toBe(1);
  });

  it('[DEC-023] offset-equivalent expiries and equivalent URL spellings share one signature', async () => {
    const a = await post({ url: URL_A, expires_at: '2027-03-01T00:00:00Z' }, { key: 'k3' });
    const b = await post({ url: 'HTTPS://EXAMPLE.com:443/a?x=1#f', expires_at: '2027-03-01T01:00:00+01:00' }, { key: 'k3' });
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.body).toBe(a.body);
  });

  it('[DEC-023] an omitted expiry replays the persisted default even after the clock moves (no re-resolution)', async () => {
    const a = await post({ url: URL_A }, { key: 'k4' });
    clock.advance(3_600_000);
    const b = await post({ url: URL_A }, { key: 'k4' });
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.json().expires_at).toBe(a.json().expires_at);
    expect(await count('short_links')).toBe(1);
  });

  it('[DEC-016] key scope is per client: another client with the same key and body gets its own link', async () => {
    const a = await post({ url: URL_A }, { key: 'k5', client: 'c1' });
    const b = await post({ url: URL_A }, { key: 'k5', client: 'c2' });
    expect(b.headers['idempotency-replayed']).toBeUndefined();
    expect(b.json().short_code).not.toBe(a.json().short_code);
    expect(await count('idempotency_records')).toBe(2);
  });

  it('[DEC-031] retention is 24 h from the terminal state: replay just before, a new request from the boundary', async () => {
    const a = await post({ url: URL_A }, { key: 'k6' });
    clock.advance(86_400_000 - 1);
    expect((await post({ url: URL_A }, { key: 'k6' })).headers['idempotency-replayed']).toBe('true');
    clock.advance(1);
    const c = await post({ url: URL_A }, { key: 'k6' });
    expect(c.statusCode).toBe(201);
    expect(c.headers['idempotency-replayed']).toBeUndefined();
    expect(c.json().short_code).not.toBe(a.json().short_code); // LIM-001: a second mapping after retention
    expect(await count('short_links')).toBe(2);
  });

  it('[DEC-030] a concurrent same-key same-signature request sees 409 idempotency_request_in_progress', async () => {
    await q("insert into idempotency_records(client_id, idempotency_key, signature, state, request_id, lease_expires_at) values ('c1','k7',$1,'IN_PROGRESS','other','2026-12-01T00:00:30Z')", [
      computeSignature({ url: URL_A, expiry: ABSENT }),
    ]);
    const res = await post({ url: URL_A }, { key: 'k7' });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('idempotency_request_in_progress');
    const other = await post({ url: 'https://example.com/z' }, { key: 'k7' });
    expect(other.json().reason).toBe('idempotency_key_conflict'); // a different signature always conflicts
    expect(await count('short_links')).toBe(0);
  });

  it('[DEC-030] a lease-expired IN_PROGRESS record is treated as absent and the key is available', async () => {
    await q("insert into idempotency_records(client_id, idempotency_key, signature, state, request_id, lease_expires_at) values ('c1','k8','stale','IN_PROGRESS','other','2026-11-30T23:59:59Z')");
    const res = await post({ url: URL_A }, { key: 'k8' });
    expect(res.statusCode).toBe(201);
    expect(res.headers['idempotency-replayed']).toBeUndefined();
  });

  it('[FR-017][FR-018] 10 concurrent same-key requests: exactly one mapping and one outcome', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => post({ url: URL_A }, { key: 'k9' })));
    const ok = results.filter((r) => r.statusCode === 201);
    const inProgress = results.filter((r) => r.statusCode === 409);
    expect(ok.length + inProgress.length).toBe(10);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.filter((r) => r.headers['idempotency-replayed'] === undefined)).toHaveLength(1);
    for (const r of inProgress) expect(r.json().reason).toBe('idempotency_request_in_progress');
    expect(new Set(ok.map((r) => r.json().short_code)).size).toBe(1);
    expect(await count('short_links')).toBe(1);
    expect(await count('idempotency_records', "state='COMPLETED'")).toBe(1);
  });

  it('[FR-017] 10 concurrent keyless requests produce 10 distinct links', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => post({ url: URL_A })));
    expect(new Set(results.map((r) => r.json().short_code)).size).toBe(10);
    expect(await count('short_links')).toBe(10);
  });
});

describe('T008 atomic check-and-commit in PostgreSQL (DEC-034, ADR-026, LIM-002)', () => {
  it('[DEC-034][ADR-010] the lease is now + 60 s from the Clock, and a lease-expired commit is aborted with no mapping', async () => {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const atGate = new Promise<void>((r) => (reached = r));
    let first = true;
    app = makeServer({
      wrap: (real) => ({
        ...real,
        commitCreated: async (i) => {
          if (first) {
            first = false;
            reached();
            await gate; // the slow request outlives its lease here
          }
          return real.commitCreated(i);
        },
      }),
    });

    const p1 = post({ url: URL_A }, { key: 'k10' });
    await atGate;
    const inflight = (await q("select state, lease_expires_at from idempotency_records where idempotency_key='k10'"))[0]!;
    expect(inflight.state).toBe('IN_PROGRESS');
    expect(inflight.lease_expires_at.toISOString()).toBe('2026-12-01T00:01:00.000Z'); // Clock + 60 s

    clock.advance(61_000); // the lease expires; a retry supersedes the slow request
    const r2 = await post({ url: URL_A }, { key: 'k10' });
    expect(r2.statusCode).toBe(201);

    release();
    const r1 = await p1;
    expect(r1.statusCode).toBe(503);
    expect(r1.json().reason).toBe('request_superseded');
    expect(r1.headers['retry-after']).toBe('1');
    expect(r1.headers['content-type']).toMatch(/^application\/problem\+json/);

    expect(await count('short_links')).toBe(1); // the aborted commit was rolled back: one mapping only
    const rec = (await q("select * from idempotency_records where idempotency_key='k10'"))[0]!;
    expect(rec.state).toBe('COMPLETED');
    expect(rec.short_code).toBe(r2.json().short_code); // the record is untouched by the aborted request
    const replay = await post({ url: URL_A }, { key: 'k10' });
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toBe(r2.body);
  });

  it('[DEC-034] a lease that expired with nobody superseding also aborts the commit (record kept, no mapping)', async () => {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const atGate = new Promise<void>((r) => (reached = r));
    app = makeServer({
      wrap: (real) => ({
        ...real,
        commitCreated: async (i) => {
          reached();
          await gate;
          return real.commitCreated(i);
        },
      }),
    });
    const p = post({ url: URL_A }, { key: 'k11' });
    await atGate;
    clock.advance(60_000); // lease_expires_at == now: no longer valid (lease_expires_at > $now fails)
    release();
    const res = await p;
    expect(res.statusCode).toBe(503);
    expect(res.json().reason).toBe('request_superseded');
    expect(await count('short_links')).toBe(0);
  });

  it('[DEC-034] the commit and the record update are one transaction: a failed update leaves no link behind', async () => {
    await q("insert into idempotency_records(client_id, idempotency_key, signature, state, request_id, lease_expires_at) values ('c1','k12','x','IN_PROGRESS','other','2026-12-01T00:00:30Z')");
    // Direct store call with a request_id that does not own the record: the conditional UPDATE matches nothing.
    const store = pgCreateLinkStore(pgDatabase(pgc.config), clock);
    await expect(
      store.commitCreated({
        clientId: 'c1', key: 'k12', requestId: 'not-the-owner',
        link: { normalizedUrl: URL_A, creatorClientId: 'c1', createdAt: clock.now(), expiresAt: '2026-12-31T00:00:00Z', expirySource: 'DEFAULT' },
        buildResponse: (code) => ({ status: 201, body: JSON.stringify({ short_code: code }) }),
      }),
    ).rejects.toMatchObject({ name: 'RequestSupersededError' });
    expect(await count('short_links')).toBe(0);
    expect((await q("select state from idempotency_records where idempotency_key='k12'"))[0]!.state).toBe('IN_PROGRESS');
  });
});

describe('T008 failure classification (DEC-029, DEC-033, DEC-036, PA-008)', () => {
  const failOnce = (make: () => Error) => (real: CreateLinkStore): CreateLinkStore => {
    let first = true;
    return {
      ...real,
      commitCreated: async (i) => {
        if (first) {
          first = false;
          throw make();
        }
        return real.commitCreated(i);
      },
    };
  };

  it('[DEC-033] a transient persistence failure -> 503 persistence_unavailable, key released, no FAILED record', async () => {
    app = makeServer({ wrap: failOnce(() => Object.assign(new Error('terminating connection'), { code: '57P01' })) });
    const a = await post({ url: URL_A }, { key: 'k13' });
    expect(a.statusCode).toBe(503);
    expect(a.json().reason).toBe('persistence_unavailable');
    expect(a.headers['retry-after']).toBe('1');
    expect(await count('idempotency_records')).toBe(0);
    expect(await count('short_links')).toBe(0);
    const b = await post({ url: URL_A }, { key: 'k13' }); // the key stays usable
    expect(b.statusCode).toBe(201);
    expect(b.headers['idempotency-replayed']).toBeUndefined();
  });

  it('[PA-008] code space exhaustion is transient: 503, no FAILED record, key usable', async () => {
    for (const c of ['Full001', 'Full002', 'Full003']) {
      await q("insert into short_links(short_code, normalized_url, creator_client_id, expires_at, expiry_source) values ($1,'https://example.com/x','c1','2027-01-01Z','DEFAULT')", [c]);
    }
    const seq = 'Full001Full002Full003';
    let draws = 0;
    app = makeServer({ randomInt: (n) => (draws < seq.length ? SHORT_CODE_ALPHABET.indexOf(seq[draws++]!) : randomInt(n)) });
    const a = await post({ url: URL_A }, { key: 'k14' });
    expect(a.statusCode).toBe(503);
    expect(a.json().reason).toBe('persistence_unavailable');
    expect(await count('idempotency_records')).toBe(0);
    expect(await count('short_links')).toBe(3);
    const b = await post({ url: URL_A }, { key: 'k14' });
    expect(b.statusCode).toBe(201);
  });

  it('[DEC-029] a permanent failure -> 500 internal_error, FAILED stored and replayed; a new key is needed', async () => {
    app = makeServer({ wrap: failOnce(() => new Error('bug: password=hunter2')) });
    const a = await post({ url: URL_A }, { key: 'k15' });
    expect(a.statusCode).toBe(500);
    expect(a.json().reason).toBe('internal_error');
    expect(a.body).not.toContain('hunter2');
    const rec = (await q("select state, response_status from idempotency_records where idempotency_key='k15'"))[0]!;
    expect(rec).toMatchObject({ state: 'FAILED', response_status: 500 });
    const b = await post({ url: URL_A }, { key: 'k15' });
    expect(b.statusCode).toBe(500);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.body).toBe(a.body);
    expect(await count('short_links')).toBe(0);
    const c = await post({ url: URL_A }, { key: 'k15-new' }); // a client retrying after a failure uses a new key
    expect(c.statusCode).toBe(201);
  });

  it('[FR-019] a permanent failure without a key is a 500 problem with no record and no leak', async () => {
    app = makeServer({ wrap: (real) => ({ ...real, createWithoutKey: async () => { throw new Error('bug: password=hunter2'); } }) });
    const res = await post({ url: URL_A });
    expect(res.statusCode).toBe(500);
    expect(res.json().reason).toBe('internal_error');
    expect(res.body).not.toContain('hunter2');
    expect(await count('idempotency_records')).toBe(0);
  });
});
