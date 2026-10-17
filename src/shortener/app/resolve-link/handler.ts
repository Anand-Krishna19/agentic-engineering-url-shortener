import { isShortCode } from '../../domain/code/generator.js';
import { problem, type HttpResult } from '../create-link/service.js';
import { resolveLink, type ResolveDeps, type ResolveInput } from './service.js';

/**
 * The stored URL may hold characters that cannot appear in an HTTP header (non-ASCII path or query: the
 * approved normalization re-encodes nothing). They are percent-encoded as UTF-8 for the wire only; the
 * stored value is untouched and ASCII is never altered.
 */
export function toWireLocation(url: string): string {
  let out = '';
  for (const ch of url) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x21 && cp <= 0x7e) out += ch;
    else {
      try {
        out += encodeURIComponent(ch);
      } catch {
        out += '%EF%BF%BD'; // a lone surrogate: U+FFFD
      }
    }
  }
  return out;
}

export async function handleResolveLink(deps: ResolveDeps, req: ResolveInput): Promise<HttpResult> {
  // Anything that is not exactly 7 base62 characters gets the same 404 as an unknown code, without a lookup (FR-009).
  if (!isShortCode(req.code)) return problem(404, 'not_found', req.requestId);
  const result = await resolveLink(deps, req);
  return result.location === undefined ? result : { ...result, location: toWireLocation(result.location) };
}
