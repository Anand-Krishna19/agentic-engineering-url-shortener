import type { FastifyInstance } from 'fastify';
import { problem } from '../../app/create-link/service.js';
import { handleResolveLink } from '../../app/resolve-link/handler.js';
import type { ResolveDeps } from '../../app/resolve-link/service.js';
import { send } from './create-link.js';

// GET /{short_code} (contracts/shortener.openapi.yaml, resolveLink). Static routes such as /healthz win
// over the parametric route, so operational endpoints are never shadowed.

export function registerResolveLink(app: FastifyInstance, deps: ResolveDeps): void {
  app.get<{ Params: { short_code: string } }>('/:short_code', async (req, reply) =>
    send(reply, await handleResolveLink(deps, { code: req.params.short_code, method: req.method, requestId: req.id })),
  );

  // A path the router cannot match (too long, extra segments) gets the same 404 problem as an unknown code (FR-009).
  app.setNotFoundHandler((req, reply) => send(reply, problem(404, 'not_found', req.id)));

  app.setErrorHandler((error, req, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) return send(reply, problem(400, 'malformed_request', req.id));
    req.log.error({ err: error }, 'resolve-link failed unexpectedly');
    return send(reply, problem(500, 'internal_error', req.id));
  });
}
