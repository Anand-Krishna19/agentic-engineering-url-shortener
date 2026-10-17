import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { handleCreateLink } from '../../app/create-link/handler.js';
import { problem, type CreateLinkDeps, type HttpResult } from '../../app/create-link/service.js';

// POST /v1/links route (contracts/shortener.openapi.yaml, createLink). Thin: it maps the handler's
// transport-neutral result onto HTTP and keeps every error in RFC 9457 problem+json form.

export interface CreateLinkRouteDeps extends CreateLinkDeps {
  /**
   * Resolves the calling client (key scope and link ownership). Session-token and address-hash client
   * resolution (ASM-012) is outside T008, so it is injected rather than assumed.
   */
  resolveClient(req: FastifyRequest): Promise<string>;
}

export function send(reply: FastifyReply, result: HttpResult) {
  reply.code(result.status);
  if (result.status !== 302) reply.header("content-type", result.status >= 400 ? "application/problem+json" : "application/json; charset=utf-8");
  if (result.location !== undefined) reply.header("Location", result.location).header("Cache-Control", "no-store");
  if (result.replayed) reply.header('Idempotency-Replayed', 'true');
  if (result.retryAfterSeconds !== undefined) reply.header('Retry-After', String(result.retryAfterSeconds));
  return reply.send(result.body);
}

export function registerCreateLink(app: FastifyInstance, deps: CreateLinkRouteDeps): void {
  app.register(async (scope) => {
    // Parser failures (invalid JSON, empty body, wrong media type) are 4xx framework errors: all are malformed_request.
    scope.setErrorHandler((error, req, reply) => {
      const status = (error as { statusCode?: number }).statusCode;
      if (status !== undefined && status >= 400 && status < 500) return send(reply, problem(400, 'malformed_request', req.id));
      req.log.error({ err: error }, 'create-link failed unexpectedly');
      return send(reply, problem(500, 'internal_error', req.id));
    });

    scope.post('/v1/links', async (req, reply) => {
      const clientId = await deps.resolveClient(req);
      const result = await handleCreateLink(deps, {
        body: req.body,
        idempotencyKey: req.headers['idempotency-key'],
        clientId,
        requestId: req.id,
      });
      return send(reply, result);
    });
  });
}
