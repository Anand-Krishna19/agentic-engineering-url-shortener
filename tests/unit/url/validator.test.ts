import { describe, expect, it } from 'vitest';
import { validateUrl, type UrlRejectionReason } from '../../../src/shortener/domain/url/validator.js';

const accepts = (raw: string, normalized: string, opts?: { publicBaseUrl?: string }) =>
  expect(validateUrl(raw, opts), raw).toEqual({ ok: true, normalized });
const rejects = (raw: unknown, reason: UrlRejectionReason, opts?: { publicBaseUrl?: string }) =>
  expect(validateUrl(raw as string, opts), String(raw)).toEqual({ ok: false, reason });

describe('T006 normalization: exactly three transformations (FR-002, DEC-008, data-model 4.1)', () => {
  it.each([
    ['HTTP://Example.COM/Path?Q=1#frag', 'http://example.com/Path?Q=1'],
    ['https://EXAMPLE.com/CaseSensitivePath', 'https://example.com/CaseSensitivePath'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['http://example.com:80', 'http://example.com'],
    ['https://example.com:8443/x', 'https://example.com:8443/x'],
    ['http://example.com:443/', 'http://example.com:443/'],
    ['https://example.com:80/', 'https://example.com:80/'],
    ['https://example.com/#', 'https://example.com/'],
    ['https://example.com?a=1#f', 'https://example.com?a=1'],
    ['https://[2001:4860:4860::8888]:443/', 'https://[2001:4860:4860::8888]/'],
    ['https://[2001:4860:4860::8888]:8080/p', 'https://[2001:4860:4860::8888]:8080/p'],
    ['https://8.8.8.8/', 'https://8.8.8.8/'],
  ])('[FR-002] %s -> %s', (raw, normalized) => accepts(raw, normalized));

  it('[FR-002] makes no trailing-slash, dot-segment, case, or percent-encoding changes to path or query', () => {
    accepts('https://example.com', 'https://example.com');
    accepts('https://example.com/a/../b//c/?x=%7e&Y=%7E', 'https://example.com/a/../b//c/?x=%7e&Y=%7E');
    accepts('https://example.com/a b'.replace(' ', '%20'), 'https://example.com/a%20b');
  });

  it('[FR-002] normalization is idempotent', () => {
    for (const raw of ['HTTP://Example.COM:80/A#f', 'https://example.com:443', 'https://example.com/p?q#']) {
      const first = validateUrl(raw);
      expect(first.ok).toBe(true);
      if (first.ok) expect(validateUrl(first.normalized)).toEqual(first);
    }
  });
});

describe('T006 length and shape (FR-003, DEC-008)', () => {
  it('[FR-003] accepts exactly 2048 characters and rejects 2049 as url_too_long', () => {
    const base = 'https://example.com/';
    const ok = base + 'a'.repeat(2048 - base.length);
    expect(ok).toHaveLength(2048);
    expect(validateUrl(ok).ok).toBe(true);
    rejects(ok + 'a', 'url_too_long');
  });

  it('[FR-003] the length rule is checked before anything else', () => {
    rejects('ftp://' + 'a'.repeat(3000), 'url_too_long');
  });

  it.each([
    '',
    '   ',
    'not a url',
    'example.com',
    '//example.com/path',
    '/relative/path',
    'https://',
    'https:///path',
    'http://:80/',
    'https:example.com',
    'https:/example.com',
  ])('[FR-003] malformed or hostless input %j is invalid_url', (raw) => rejects(raw, 'invalid_url'));

  it.each([undefined, null, 42, {}, []])('[FR-003] non-string input %j is invalid_url', (raw) =>
    rejects(raw, 'invalid_url'),
  );
});

describe('T006 scheme allow-list (FR-004, DEC-008)', () => {
  it.each([
    'ftp://example.com/',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'mailto:a@example.com',
    'vbscript:msgbox(1)',
    'blob:https://example.com/0000',
    'ws://example.com/',
    'gopher://example.com/',
  ])('[FR-004] %s is unsupported_scheme', (raw) => rejects(raw, 'unsupported_scheme'));

  it('[FR-004] http and https in any case are accepted', () => {
    accepts('hTtP://example.com/', 'http://example.com/');
    accepts('HTTPS://example.com/', 'https://example.com/');
  });
});

describe('T006 host and user information (PA-006, PA-007)', () => {
  it('[PA-006] non-ASCII hosts are invalid_url; punycode is accepted', () => {
    rejects('https://exämple.com/', 'invalid_url');
    rejects('https://例え.jp/', 'invalid_url');
    accepts('https://xn--exmple-cua.com/', 'https://xn--exmple-cua.com/');
  });

  it('[PA-006] percent-escapes in the host are invalid_url (they would change the stored host)', () => {
    rejects('https://exa%6dple.com/', 'invalid_url');
  });

  it.each([
    'https://user@example.com/',
    'https://user:pass@example.com/',
    'https://@example.com/',
    'https://:@example.com/',
  ])('[PA-007] user information in %s is invalid_url', (raw) => rejects(raw, 'invalid_url'));

  it('[PA-007] an @ in the path or query is not user information', () => {
    accepts('https://example.com/@user?e=a@b.c', 'https://example.com/@user?e=a@b.c');
  });

  it.each([' https://example.com/', 'https://example.com/ ', 'https://example.com/\npath', 'https://example.com/\tx', 'https://example.com/\u0000', 'https://exa mple.com/', 'https://example.com/a\u007fb', 'https://localhost/\n'])(
    '[FR-003][ADR-027] whitespace or control characters in %j are invalid_url',
    (raw) => rejects(raw, 'invalid_url'),
  );
});

describe('T006 destination policy (FR-005, data-model 2.4)', () => {
  it.each([
    'http://localhost/',
    'http://LOCALHOST:3000/',
    'http://localhost./',
    'http://foo.localhost/',
    'http://printer.local/',
    'http://db.internal/',
    'http://svc.corp.internal:8080/',
  ])('[FR-005] reserved name %s is forbidden_destination', (raw) => rejects(raw, 'forbidden_destination'));

  it('[FR-005] name suffixes need a dot boundary', () => {
    accepts('http://localhost.example.com/', 'http://localhost.example.com/');
    accepts('http://notlocal.com/', 'http://notlocal.com/');
    accepts('http://example.internal.com/', 'http://example.internal.com/');
  });

  it.each([
    'http://127.0.0.1/',
    'http://127.255.255.254/',
    'http://127.1/',
    'http://0x7f.0.0.1/',
    'http://0x7f000001/',
    'http://2130706433/',
    'http://017700000001/',
    'http://0177.0.0.1/',
    'http://0.0.0.0/',
    'http://0/',
    'http://10.0.0.1/',
    'http://10.255.255.255/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1/',
    'http://100.127.255.255/',
    'http://192.0.0.1/',
    'http://192.0.2.1/',
    'http://198.18.0.1/',
    'http://198.51.100.7/',
    'http://203.0.113.9/',
    'http://224.0.0.1/',
    'http://239.255.255.255/',
    'http://240.0.0.1/',
    'http://255.255.255.255/',
  ])('[FR-005] IPv4 literal %s is forbidden_destination', (raw) => rejects(raw, 'forbidden_destination'));

  it.each([
    'http://172.15.255.255/',
    'http://172.32.0.1/',
    'http://100.63.255.255/',
    'http://100.128.0.1/',
    'http://11.0.0.1/',
    'http://8.8.8.8/',
    'http://1.1.1.1/',
    'http://169.253.1.1/',
    'http://223.255.255.255/',
  ])('[FR-005] public IPv4 %s is accepted', (raw) => expect(validateUrl(raw).ok, raw).toBe(true));

  it.each([
    'http://[::1]/',
    'http://[::]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:10.0.0.1]/',
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[2002:7f00:1::1]/',
    'http://[fe80::1]/',
    'http://[febf::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/',
    'http://[100::1]/',
  ])('[FR-005] IPv6 literal %s is forbidden_destination', (raw) => rejects(raw, 'forbidden_destination'));

  it.each(['http://[2001:4860:4860::8888]/', 'http://[2606:4700:4700::1111]/', 'http://[fec0::1]/'])(
    '[FR-005] public IPv6 %s is accepted',
    (raw) => {
      // fec0::/10 (site-local) is deprecated and not in the approved range list; only listed ranges are rejected.
      expect(validateUrl(raw).ok, raw).toBe(true);
    },
  );

  it('[FR-005] a URL equal to the configured public base (host and port) is a self-reference', () => {
    const o = { publicBaseUrl: 'https://short.example.com' };
    rejects('https://short.example.com/abc', 'forbidden_destination', o);
    rejects('https://SHORT.example.com:443/x', 'forbidden_destination', o);
    rejects('http://short.example.com:443/x', 'forbidden_destination', o);
    accepts('https://short.example.com:8443/x', 'https://short.example.com:8443/x', o);
    accepts('https://other.example.com/x', 'https://other.example.com/x', o);
    const o2 = { publicBaseUrl: 'https://short.example.com:8443' };
    rejects('https://short.example.com:8443/x', 'forbidden_destination', o2);
    accepts('https://short.example.com/x', 'https://short.example.com/x', o2);
  });

  it('[FR-005] no DNS resolution: validation is synchronous and never returns a promise', () => {
    const r = validateUrl('https://no-such-host.invalid-tld-for-test/');
    expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
    expect(r.ok).toBe(true);
  });
});

describe('T006 rejection order (ADR-027, data-model 2.3)', () => {
  it('[FR-003..005] length, parse, scheme, host, user info, control chars, then destination policy', () => {
    rejects('ftp://user@localhost/', 'unsupported_scheme');
    rejects('https://user@localhost/', 'invalid_url');
    rejects('https://exämple.com@localhost/', 'invalid_url');
    rejects('https://localhost/', 'forbidden_destination');
  });

  it('[FR-003] rejections carry only a machine-readable reason, no echo of the input', () => {
    const r = validateUrl('https://user:secret@example.com/');
    expect(Object.keys(r).sort()).toEqual(['ok', 'reason']);
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});
