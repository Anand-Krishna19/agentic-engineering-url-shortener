import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOperationsRoutes, type ReadinessChecks } from './health.js';
import { generateRequestId, loggerOptions, REQUEST_ID_LOG_LABEL, type LogStream } from './logger.js';

export interface BuildServerOptions {
  logLevel?: string;
  logStream?: LogStream;
  readinessChecks?: ReadinessChecks;
}

export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(opts.logLevel ?? 'info', opts.logStream),
    requestIdHeader: false,
    requestIdLogLabel: REQUEST_ID_LOG_LABEL,
    genReqId: generateRequestId,
    // ADR-002: strict, contract-first validation. Fastify's permissive defaults are turned off.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  });
  registerOperationsRoutes(app, opts.readinessChecks ?? {});
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
