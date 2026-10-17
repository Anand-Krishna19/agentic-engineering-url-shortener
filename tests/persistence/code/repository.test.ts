import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CodeGenerationExhaustedError,
  SHORT_CODE_ALPHABET,
  insertWithUniqueCode,
} from '../../../src/shortener/domain/code/generator.js';
import { insertShortLink, type NewShortLink } from '../../../src/shortener/adapters/persistence/short-link-repository.js';

// Real PostgreSQL 16.2 with the T003 init scripts; the service role shortener_app (DML only) is used, as in production.
const NAME = `t007-${process.pid}`;
const SHORTENER_PW = 'test-shortener-pw';
const IMAGE = 'postgres:16.2-alpine';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let port = 0;
const clients: pg.Client[] = [];

async function connect(): Promise<pg.Client> {
  // One client per connection, no pooling (DEC-113).
  const c = new pg.Client({ host: '127.0.0.1', port, user: 'shortener_app', password: SHORTENER_PW, database: 'urlshortener' });
  await c.connect();
  clients.push(c);
  return c;
}

/** Deterministic RandomInt that emits the given codes character by character. */
function randomFrom(codes: string[]) {
  const chars = codes.join('');
  let i = 0;
  return () => SHORT_CODE_ALPHABET.indexOf(chars[i++ % chars.length]!);
}

const link = (code: string, url = `https://example.com/${code}`, expires = new Date(Date.now() + 86_400_000)): NewShortLink => ({
  short_code: code,
  normalized_url: url,
  creator_client_id: 'c1',
  created_at: new Date(),
  expires_at: expires,
  expiry_source: 'DEFAULT',
});

let db: pg.Client;

beforeAll(async () => {
  docker(
    'run', '-d', '--rm', '--name', NAME,
    '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_USER=app', '-e', 'POSTGRES_DB=urlshortener', '-e', 'POSTGRES_PASSWORD=test-admin-pw',
    '-e', `SHORTENER_APP_PASSWORD=${SHORTENER_PW}`, '-e', 'ORCHESTRATOR_APP_PASSWORD=test-orchestrator-pw',
    '-v', `${resolve('docker/init-db')}:/docker-entrypoint-initdb.d:ro`,
    IMAGE,
  );
  port = Number(docker('port', NAME, '5432/tcp').trim().split('\n')[0]!.split(':').pop());
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      db = await connect(); // succeeds only after init created shortener_app and the real server is up
      break;
    } catch (e) {
      if (Date.now() > deadline) throw new Error(`database not ready: ${String(e)}\n${docker('logs', NAME)}`);
      await sleep(1000);
    }
  }
  await db.query("insert into clients(client_id, ip_hash) values ('c1','h1')");
}, 150_000);

afterAll(async () => {
  await Promise.allSettled(clients.map((c) => c.end()));
  try {
    docker('rm', '-f', NAME);
  } catch {
    /* already gone */
  }
});

const count = async (sql = 'select count(*)::int as n from short_links') => ((await db.query(sql)).rows[0] as { n: number }).n;

describe('T007 short link insert and unique index (FR-006, ADR-017)', () => {
  it('[FR-006] inserts a free code and reports true', async () => {
    expect(await insertShortLink(db, link('Aaaaaa1'))).toBe(true);
    const row = (await db.query("select normalized_url from short_links where short_code='Aaaaaa1'")).rows[0];
    expect(row.normalized_url).toBe('https://example.com/Aaaaaa1');
  });

  it('[FR-006] a taken code reports false, adds no row, and never overwrites the original', async () => {
    const before = await count();
    expect(await insertShortLink(db, link('Aaaaaa1', 'https://attacker.example/'))).toBe(false);
    expect(await count()).toBe(before);
    const row = (await db.query("select normalized_url from short_links where short_code='Aaaaaa1'")).rows[0];
    expect(row.normalized_url).toBe('https://example.com/Aaaaaa1');
  });

  it('[FR-006] a code is never reassigned after its link has expired', async () => {
    expect(await insertShortLink(db, link('Expir01', 'https://example.com/old', new Date(Date.now() - 1000)))).toBe(true);
    expect(await insertShortLink(db, link('Expir01', 'https://example.com/new'))).toBe(false);
    const row = (await db.query("select normalized_url from short_links where short_code='Expir01'")).rows[0];
    expect(row.normalized_url).toBe('https://example.com/old');
  });

  it('[FR-007][ASM-015] codes are case-sensitive: abcdefg and ABCDEFG coexist', async () => {
    expect(await insertShortLink(db, link('abcdefg'))).toBe(true);
    expect(await insertShortLink(db, link('ABCDEFG'))).toBe(true);
  });

  it('[FR-006] concurrent inserts of the same code on separate connections: exactly one wins', async () => {
    const conns = await Promise.all(Array.from({ length: 10 }, () => connect()));
    const results = await Promise.all(conns.map((c) => insertShortLink(c, link('Race001'))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await count("select count(*)::int as n from short_links where short_code='Race001'")).toBe(1);
  });

  it('[FR-006] the repository does not abort an open transaction when it hits a collision', async () => {
    await db.query('begin');
    expect(await insertShortLink(db, link('Aaaaaa1'))).toBe(false);
    expect(await insertShortLink(db, link('Txn0001'))).toBe(true); // would fail if the transaction were aborted
    await db.query('commit');
    expect(await count("select count(*)::int as n from short_links where short_code='Txn0001'")).toBe(1);
  });
});

describe('T007 collision recovery against the real unique index (FR-007, PA-008)', () => {
  it('[FR-007] a collision on the first code retries and stores the second', async () => {
    const r = await insertWithUniqueCode((code) => insertShortLink(db, link(code)).then((inserted) => (inserted ? { inserted: true as const, value: code } : { inserted: false as const })), {
      randomInt: randomFrom(['Aaaaaa1', 'Retry01']),
    });
    expect(r).toEqual({ code: 'Retry01', value: 'Retry01', attempts: 2 });
    expect(await count("select count(*)::int as n from short_links where short_code in ('Aaaaaa1','Retry01')")).toBe(2);
  });

  it('[FR-007][PA-008] three collisions fail transiently, add no rows, and create no FAILED idempotency record', async () => {
    for (const c of ['Full001', 'Full002', 'Full003']) expect(await insertShortLink(db, link(c))).toBe(true);
    const before = await count();
    await expect(
      insertWithUniqueCode((code) => insertShortLink(db, link(code, 'https://example.com/never')).then((inserted) => (inserted ? { inserted: true as const, value: code } : { inserted: false as const })), {
        randomInt: randomFrom(['Full001', 'Full002', 'Full003', 'Spare01']),
      }),
    ).rejects.toBeInstanceOf(CodeGenerationExhaustedError);
    expect(await count()).toBe(before);
    expect(await count("select count(*)::int as n from short_links where short_code='Spare01'")).toBe(0);
    expect(await count("select count(*)::int as n from idempotency_records where state='FAILED'")).toBe(0);
  });
});
