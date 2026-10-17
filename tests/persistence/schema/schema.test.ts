import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real PostgreSQL 16.2 in a throwaway container with docker/init-db mounted (ADR-003, DEC-098).
const NAME = `t003-${process.pid}`;
const ADMIN_PW = 'test-admin-pw';
const SHORTENER_PW = 'test-shortener-pw';
const ORCH_PW = 'test-orchestrator-pw';
const IMAGE = 'postgres:16.2-alpine';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

interface Res {
  ok: boolean;
  out: string;
  err: string;
}

function psql(user: string, pw: string, db: string, sql: string): Res {
  try {
    const out = docker(
      'exec', '-e', `PGPASSWORD=${pw}`, NAME,
      'psql', '-h', '127.0.0.1', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql,
    );
    return { ok: true, out: out.trim(), err: '' };
  } catch (e) {
    const x = e as { stderr?: string; stdout?: string };
    return { ok: false, out: (x.stdout ?? '').trim(), err: (x.stderr ?? '').trim() };
  }
}

const admin = (db: string, sql: string) => psql('app', ADMIN_PW, db, sql);
const shortener = (sql: string) => psql('shortener_app', SHORTENER_PW, 'urlshortener', sql);
const orch = (sql: string) => psql('orchestrator_app', ORCH_PW, 'orchestrator', sql);

beforeAll(() => {
  expect(existsSync('docker/init-db/001-schema.sql')).toBe(true);
  expect(existsSync('docker/init-db/002-roles.sql')).toBe(true);
  docker(
    'run', '-d', '--rm', '--name', NAME,
    '-e', 'POSTGRES_USER=app', '-e', 'POSTGRES_DB=urlshortener', '-e', `POSTGRES_PASSWORD=${ADMIN_PW}`,
    '-e', `SHORTENER_APP_PASSWORD=${SHORTENER_PW}`, '-e', `ORCHESTRATOR_APP_PASSWORD=${ORCH_PW}`,
    '-v', `${resolve('docker/init-db')}:/docker-entrypoint-initdb.d:ro`,
    IMAGE,
  );
  const deadline = Date.now() + 90_000;
  for (;;) {
    // TCP only answers once the entrypoint's temporary init server has been replaced by the real one.
    const r = admin('urlshortener', "select 1 from pg_database where datname='orchestrator'");
    if (r.ok && r.out === '1') break;
    if (Date.now() > deadline) throw new Error(`init did not finish: ${docker('logs', NAME)}`);
    execFileSync('node', ['-e', 'setTimeout(()=>{},1000)']);
  }
}, 150_000);

afterAll(() => {
  try {
    docker('rm', '-f', NAME);
  } catch {
    /* already gone */
  }
});

const insertLink = (code: string, url: string) =>
  shortener(
    `insert into short_links(short_code, normalized_url, creator_client_id, expires_at, expiry_source) values ('${code}','${url}','c1', now() + interval '1 day','DEFAULT')`,
  );

describe('T003 schema and roles', () => {
  it('[FR-001][ADR-003] application-plane tables exist in urlshortener', () => {
    const r = admin(
      'urlshortener',
      "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'",
    );
    for (const t of ['clients', 'short_links', 'redirect_counters', 'redirect_events', 'idempotency_records', 'app_audit_events']) {
      expect(r.out, t).toContain(t);
    }
  });

  it('[FR-107][ADR-018] control-plane workflow state and audit tables exist in orchestrator', () => {
    const r = admin(
      'orchestrator',
      "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'",
    );
    expect(r.out).toContain('workflow_runs');
    expect(r.out).toContain('audit_events');
  });

  it('[FR-001] short_links enforces 7-char base62 codes and the 2048-char URL bound', () => {
    expect(shortener("insert into clients(client_id, ip_hash) values ('c1','h1')").ok).toBe(true);
    expect(insertLink('Ab3Zz09', 'https://example.com/').ok).toBe(true);
    expect(insertLink('short', 'https://example.com/').ok).toBe(false);
    expect(insertLink('Ab3Zz0!', 'https://example.com/').ok).toBe(false);
    expect(insertLink('Ab3Zz09', 'https://example.com/dup').ok).toBe(false); // primary key
    expect(insertLink('Cd4Yy18', `https://e.com/${'a'.repeat(2048)}`).ok).toBe(false);
  });

  it('[FR-006] short codes are case-sensitive (binary collation)', () => {
    expect(insertLink('ab3zz09', 'https://example.com/lower').ok).toBe(true);
  });

  it('[FR-015][DEC-034] idempotency_records has per-client key scope and a closed state set', () => {
    const ins = (state: string, key = 'k1') =>
      shortener(
        `insert into idempotency_records(client_id, idempotency_key, signature, state, request_id, lease_expires_at) values ('c1','${key}','sig','${state}','r1', now() + interval '60 seconds')`,
      );
    expect(ins('IN_PROGRESS').ok).toBe(true);
    expect(ins('IN_PROGRESS').ok).toBe(false); // primary key (client_id, idempotency_key)
    expect(ins('BOGUS', 'k2').ok).toBe(false);
    const upd = shortener(
      "update idempotency_records set state='COMPLETED' where client_id='c1' and idempotency_key='k1' and request_id='r1' and state='IN_PROGRESS' and lease_expires_at > now()",
    );
    expect(upd.ok).toBe(true);
  });

  it('[FR-107] workflow_runs restricts status to the approved set', () => {
    const ins = (id: string, status: string) =>
      orch(
        `insert into workflow_runs(run_id, profile, scenario_tag, agent_mode, status) values ('${id}','sdlc/1','TEST','SCRIPTED','${status}')`,
      );
    expect(ins('run-1', 'CREATED').ok).toBe(true);
    expect(ins('run-2', 'WHATEVER').ok).toBe(false);
  });

  it('[DEC-095] application roles have DML but no DDL', () => {
    expect(shortener('create table t_illegal(x int)').ok).toBe(false);
    expect(orch('create table t_illegal(x int)').ok).toBe(false);
    expect(shortener("delete from short_links where short_code='ab3zz09'").ok).toBe(true);
  });

  it('[DEC-095][ADR-006] audit tables are INSERT-only for the application roles', () => {
    expect(
      shortener(
        "insert into app_audit_events(request_id, correlation_id, action, subject, result) values ('r1','c1','rate_limited','x','REJECTED')",
      ).ok,
    ).toBe(true);
    for (const sql of ["update app_audit_events set result='SUCCESS'", 'delete from app_audit_events']) {
      const r = shortener(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.err, sql).toContain('permission denied');
    }

    expect(
      orch(
        "insert into audit_events(run_id, seq, actor_type, action, result, prev_hash, hash) values ('run-1',1,'SYSTEM','RUN_CREATED','SUCCESS','0','h1')",
      ).ok,
    ).toBe(true);
    for (const sql of ["update audit_events set result='FAILURE'", 'delete from audit_events']) {
      const r = orch(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.err, sql).toContain('permission denied');
    }
  });

  it('[ADR-006] triggers also block UPDATE/DELETE/TRUNCATE on audit tables for the owner', () => {
    for (const sql of ['update audit_events set result=result', 'delete from audit_events', 'truncate audit_events']) {
      const r = admin('orchestrator', sql);
      expect(r.ok, sql).toBe(false);
      expect(r.err, sql).toMatch(/append-only/);
    }
    const a = admin('urlshortener', 'delete from app_audit_events');
    expect(a.ok).toBe(false);
    expect(a.err).toMatch(/append-only/);
  });

  it('[ADR-016] the control plane cannot connect to the shortener database', () => {
    const r = psql('orchestrator_app', ORCH_PW, 'urlshortener', 'select 1');
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/permission denied|not permitted|rejected/i);
    expect(psql('shortener_app', SHORTENER_PW, 'orchestrator', 'select 1').ok).toBe(false);
  });

  it('[DEC-095] no persistent migration role exists', () => {
    const r = admin('urlshortener', "select count(*) from pg_roles where rolname ~* 'migrat'");
    expect(r.out).toBe('0');
  });
});
