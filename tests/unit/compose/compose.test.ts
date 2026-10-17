import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = () => readFileSync('docker-compose.yml', 'utf8');

describe('T002 docker-compose', () => {
  it('[NFR-002][DEC-098] images are pinned to the PostgreSQL 16 and Redis 7.2 lines', () => {
    const c = compose();
    expect(c).toMatch(/image:\s*postgres:16\.\d+-alpine/);
    expect(c).toMatch(/image:\s*redis:7\.2(\.\d+)?-alpine/);
    expect(c).not.toMatch(/:latest/);
  });

  it('[DEC-113] PostgreSQL uses user app and database urlshortener', () => {
    const c = compose();
    expect(c).toMatch(/POSTGRES_USER:\s*app\b/);
    expect(c).toMatch(/POSTGRES_DB:\s*urlshortener\b/);
  });

  it('[ADR-015] Redis is ephemeral and password protected', () => {
    const c = compose();
    expect(c).toMatch(/-\s+--save\s+-\s+""/);
    expect(c).toMatch(/-\s+"?--appendonly"?\s+-\s+"no"/);
    expect(c).toContain('--requirepass');
  });

  it('[ADR-023] all published ports are bound to loopback', () => {
    const ports = [...compose().matchAll(/^\s*-\s*"?([0-9.]*:?\d+:\d+)"?\s*$/gm)].map((m) => m[1]!);
    expect(ports.length).toBeGreaterThanOrEqual(2);
    for (const p of ports) expect(p, p).toMatch(/^127\.0\.0\.1:/);
  });

  it('[NFR-008][DEC-113] both services define health checks', () => {
    expect((compose().match(/healthcheck:/g) ?? []).length).toBe(2);
    expect(compose()).toContain('pg_isready');
    expect(compose()).toContain('redis-cli');
  });

  it('[NFR-002] secrets come from the environment, never literals', () => {
    const c = compose();
    expect(c).toMatch(/POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
    expect(c).toMatch(/\$\{REDIS_PASSWORD:\?/);
    expect(existsSync('.env.example')).toBe(true);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.env$/m);
  });

  it('[ADR-003] init scripts directory is mounted read-only', () => {
    expect(existsSync('docker/init-db')).toBe(true);
    expect(compose()).toContain('./docker/init-db:/docker-entrypoint-initdb.d:ro');
  });
});
