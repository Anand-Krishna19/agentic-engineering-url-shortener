import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

// Throwaway PostgreSQL 16.2 with the T003 init scripts, reachable on a random loopback port.
const IMAGE = 'postgres:16.2-alpine';
export const SHORTENER_PW = 'test-shortener-pw';

const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export interface TestPostgres {
  config: pg.ClientConfig;
  stop(): void;
}

export async function startPostgres(name: string): Promise<TestPostgres> {
  docker(
    'run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_USER=app', '-e', 'POSTGRES_DB=urlshortener', '-e', 'POSTGRES_PASSWORD=test-admin-pw',
    '-e', `SHORTENER_APP_PASSWORD=${SHORTENER_PW}`, '-e', 'ORCHESTRATOR_APP_PASSWORD=test-orchestrator-pw',
    '-v', `${resolve('docker/init-db')}:/docker-entrypoint-initdb.d:ro`,
    IMAGE,
  );
  const port = Number(docker('port', name, '5432/tcp').trim().split('\n')[0]!.split(':').pop());
  const config: pg.ClientConfig = { host: '127.0.0.1', port, user: 'shortener_app', password: SHORTENER_PW, database: 'urlshortener' };
  const deadline = Date.now() + 90_000;
  for (;;) {
    const c = new pg.Client(config);
    try {
      await c.connect(); // succeeds only after init created shortener_app and the real server is up
      await c.end();
      break;
    } catch (e) {
      await c.end().catch(() => {});
      if (Date.now() > deadline) throw new Error(`database not ready: ${String(e)}\n${docker('logs', name)}`);
      await sleep(1000);
    }
  }
  return { config, stop: () => void docker('rm', '-f', name) };
}
