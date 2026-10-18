import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOperationsRoutes, type ReadinessChecks } from './health.js';
import { registerCreateLink, type CreateLinkRouteDeps } from './shortener/adapters/api/create-link.js';
import { registerResolveLink } from './shortener/adapters/api/resolve-link.js';
import type { ResolveDeps } from './shortener/app/resolve-link/service.js';
import { generateRequestId, loggerOptions, REQUEST_ID_LOG_LABEL, type LogStream } from './logger.js';
import { initializeDatabase } from './kernel/db/postgres.js';

// Initialize database before starting the server
initializeDatabase(process.env.DATABASE_URL);
export interface BuildServerOptions {
  logLevel?: string;
  logStream?: LogStream;
  readinessChecks?: ReadinessChecks;
  /** When set, registers POST /v1/links (T008). */
  createLink?: CreateLinkRouteDeps;
  /** When set, registers GET /{short_code} (T009). */
  resolveLink?: ResolveDeps;
}

export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(opts.logLevel ?? 'info', opts.logStream),
    requestIdHeader: false,
    // Above Node's 16 KB header limit, so an over-long code reaches the handler and gets the same 404 as any other (FR-009).
    maxParamLength: 16_384,
    requestIdLogLabel: REQUEST_ID_LOG_LABEL,
    genReqId: generateRequestId,
    // ADR-002: strict, contract-first validation. Fastify's permissive defaults are turned off.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  });
  registerOperationsRoutes(app, opts.readinessChecks ?? {});
  if (opts.createLink) registerCreateLink(app, opts.createLink);
  if (opts.resolveLink) registerResolveLink(app, opts.resolveLink);
  return app;
}

export interface StartOptions extends BuildServerOptions {
  host?: string;
  port?: number;
}

/** Listens on loopback by default (ADR-023, contract servers entry). */
export async function start(opts: StartOptions = {}): Promise<FastifyInstance> {
  const app = buildServer(opts);
  await app.listen({ host: opts.host ?? '127.0.0.1', port: opts.port ?? 8080 });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void start();
}
