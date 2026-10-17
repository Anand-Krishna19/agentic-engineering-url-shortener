import { randomUUID } from 'node:crypto';

// Structured JSON logging with a per-request correlation ID (NFR-005, ADR-008).
// Fastify's built-in pino is the single logger (ADR-002).

export interface LogStream {
  write(msg: string): void;
}

/** Log field that carries the correlation ID; matches `request_id` in the contract's problem details. */
export const REQUEST_ID_LOG_LABEL = 'request_id';

/** The server always mints the ID; a client-supplied header is never trusted as the correlation ID. */
export const generateRequestId = (): string => randomUUID();

export function loggerOptions(level: string, stream?: LogStream) {
  return {
    level,
    // Only method and path are logged: no peer address, headers, or query string (FR-013, data-model.md).
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        url: req.url?.split('?')[0],
      }),
    },
    ...(stream ? { stream } : {}),
  };
}
