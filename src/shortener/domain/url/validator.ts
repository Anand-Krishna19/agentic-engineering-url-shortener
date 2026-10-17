import { isIPv4 } from 'node:net';

// URL validation and normalization (FR-002 to FR-005, DEC-008, PA-006, PA-007, ADR-027).
// Pure and synchronous: no DNS resolution and no I/O (data-model.md 2.4).
//
// The WHATWG parser is used only to validate and to canonicalize IP forms for the destination check.
// The stored string is built from the raw input, because `URL.href` would add a trailing slash,
// collapse dot-segments, and re-encode: the approved normalization is exactly three steps (data-model.md 4.1).

export type UrlRejectionReason = 'url_too_long' | 'invalid_url' | 'unsupported_scheme' | 'forbidden_destination';

export type UrlValidationResult = { ok: true; normalized: string } | { ok: false; reason: UrlRejectionReason };

export interface UrlValidationOptions {
  /** The service's own public base URL; a destination with the same host and port is a self-reference. */
  publicBaseUrl?: string;
}

const MAX_URL_LENGTH = 2048;
const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };
const RESERVED_NAME_SUFFIXES = ['.localhost', '.local', '.internal'];

const reject = (reason: UrlRejectionReason): UrlValidationResult => ({ ok: false, reason });

export function validateUrl(raw: string, opts: UrlValidationOptions = {}): UrlValidationResult {
  if (typeof raw !== 'string') return reject('invalid_url');
  if (raw.length > MAX_URL_LENGTH) return reject('url_too_long');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return reject('invalid_url');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return reject('unsupported_scheme');

  // Split the raw string; the authority ends at the first / ? # or backslash (WHATWG treats \ as /).
  const parts = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#\\]*)([\s\S]*)$/.exec(raw);
  if (!parts) return reject('invalid_url'); // for example `https:example.com`
  const scheme = parts[1]!.toLowerCase();
  const authority = parts[2]!;
  const rest = parts[3]!;

  // Host must be present and ASCII; internationalized hosts must arrive as punycode (PA-006).
  const hostPort = splitHostPort(authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority);
  if (!hostPort || hostPort.host === '' || /[^\x00-\x7f]/.test(hostPort.host) || hostPort.host.includes('%')) {
    return reject('invalid_url');
  }
  // User information is rejected (PA-007).
  if (authority.includes('@')) return reject('invalid_url');
  // No control characters or whitespace anywhere (ADR-027).
  if (/[\u0000- \u007f-\u009f]/.test(raw)) return reject('invalid_url');

  if (isForbiddenDestination(parsed, opts.publicBaseUrl)) return reject('forbidden_destination');

  // Normalize: lowercase scheme and host, drop the default port, drop the fragment. Nothing else.
  const defaultPort = DEFAULT_PORTS[`${scheme}:`];
  const keepPort = hostPort.port !== '' && Number(hostPort.port) !== defaultPort;
  const hashAt = rest.indexOf('#');
  const withoutFragment = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const normalized = `${scheme}://${hostPort.host.toLowerCase()}${keepPort ? `:${hostPort.port}` : ''}${withoutFragment}`;
  return { ok: true, normalized };
}

function splitHostPort(hostPort: string): { host: string; port: string } | null {
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    if (close === -1) return null;
    const after = hostPort.slice(close + 1);
    if (after !== '' && !/^:\d*$/.test(after)) return null;
    return { host: hostPort.slice(0, close + 1), port: after.slice(1) };
  }
  const colon = hostPort.indexOf(':');
  if (colon === -1) return { host: hostPort, port: '' };
  const port = hostPort.slice(colon + 1);
  if (!/^\d*$/.test(port)) return null;
  return { host: hostPort.slice(0, colon), port };
}

// ---------------------------------------------------------------------------
// Destination policy (FR-005, data-model.md 2.4)
// ---------------------------------------------------------------------------

function isForbiddenDestination(url: URL, publicBaseUrl?: string): boolean {
  // `hostname` is already lowercase and has decimal/octal/hex IPv4 forms normalized to dotted decimal.
  const host = url.hostname;

  if (host.startsWith('[')) {
    if (isForbiddenIPv6(host.slice(1, -1))) return true;
  } else if (isIPv4(host)) {
    if (isForbiddenIPv4(host.split('.').map(Number) as [number, number, number, number])) return true;
  } else {
    const name = host.endsWith('.') ? host.slice(0, -1) : host;
    if (name === 'localhost' || RESERVED_NAME_SUFFIXES.some((s) => name.endsWith(s))) return true;
  }

  return publicBaseUrl !== undefined && isSelfReference(url, publicBaseUrl);
}

function isSelfReference(url: URL, publicBaseUrl: string): boolean {
  const base = new URL(publicBaseUrl);
  const portOf = (u: URL) => u.port || String(DEFAULT_PORTS[u.protocol] ?? '');
  return url.hostname === base.hostname && portOf(url) === portOf(base);
}

type IPv4 = readonly [number, number, number, number];

function isForbiddenIPv4([a, b, c]: IPv4): boolean {
  return (
    a === 0 || // 0.0.0.0/8 unspecified / this network
    a === 10 ||
    (a === 100 && (b & 0xc0) === 64) || // 100.64.0.0/10 shared address space
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && (b & 0xf0) === 16) ||
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 documentation
    (a === 192 && b === 168) ||
    (a === 198 && (b & 0xfe) === 18) || // 198.18.0.0/15 benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );
}

function ipv4FromHextets(hi: number, lo: number): IPv4 {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function parseIPv6(text: string): number[] | null {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toNums = (s: string) => (s === '' ? [] : s.split(':').map((h) => parseInt(h, 16)));
  const head = toNums(halves[0]!);
  const tail = halves.length === 2 ? toNums(halves[1]!) : [];
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  return fill < 0 ? null : [...head, ...new Array<number>(fill).fill(0), ...tail];
}

function isForbiddenIPv6(text: string): boolean {
  const h = parseIPv6(text);
  if (!h) return true; // unparseable literals are not routable destinations
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h as [number, number, number, number, number, number, number, number];

  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return true; // ::, ::1, ::/96
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return isForbiddenIPv4(ipv4FromHextets(h6, h7)); // IPv4-mapped
  }
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return isForbiddenIPv4(ipv4FromHextets(h6, h7)); // NAT64
  }
  if (h0 === 0x2002) return isForbiddenIPv4(ipv4FromHextets(h1, h2)); // 6to4
  return (
    (h0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (h0 & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (h0 & 0xff00) === 0xff00 || // ff00::/8 multicast
    (h0 === 0x2001 && h1 === 0x0db8) || // documentation
    (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) // 100::/64 discard
  );
}
