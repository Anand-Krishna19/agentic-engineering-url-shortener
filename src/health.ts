import type { FastifyInstance } from 'fastify';

// Operations endpoints per contracts/shortener.openapi.yaml (FR-021).

export type ReadinessCheck = () => Promise<boolean>;
/** Named dependency checks, for example `persistence`. Values only are reported, never errors or topology. */
export type ReadinessChecks = Record<string, ReadinessCheck>;

const livenessSchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: { status: { type: 'string', const: 'alive' } },
} as const;

const readinessSchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ready', 'not_ready'] },
    checks: {
      type: 'object',
      additionalProperties: { type: 'string', enum: ['ok', 'failed'] },
    },
  },
} as const;

// T004 stub: valid Prometheus text exposition with no collectors. Real metrics arrive with later tasks.
const METRICS_STUB = '# metrics stub (T004): no collectors registered\n';

export function registerOperationsRoutes(app: FastifyInstance, checks: ReadinessChecks): void {
  app.get('/healthz', { schema: { response: { 200: livenessSchema } } }, async () => ({ status: 'alive' }));

  app.get(
    '/readyz',
    { schema: { response: { 200: readinessSchema, 503: readinessSchema } } },
    async (req, reply) => {
      const results = await Promise.all(
        Object.entries(checks).map(async ([name, check]): Promise<[string, 'ok' | 'failed']> => {
          let ok = false;
          try {
            ok = await check();
          } catch {
            ok = false; // the error is deliberately neither logged nor returned: it may carry secrets
          }
          if (!ok) req.log.warn({ check: name }, 'readiness check failed');
          return [name, ok ? 'ok' : 'failed'];
        }),
      );
      const ready = results.every(([, state]) => state === 'ok');
      return reply.code(ready ? 200 : 503).send({
        status: ready ? 'ready' : 'not_ready',
        checks: Object.fromEntries(results),
      });
    },
  );

  app.get('/metrics', async (_req, reply) =>
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8').send(METRICS_STUB),
  );
}
