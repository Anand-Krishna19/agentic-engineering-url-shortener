# Security and Privacy Design (Threat Model)

**Feature**: `001-agentic-sdlc-url-shortener` | **Spec**: [spec.md](spec.md) v1.13 | **Plan**: [plan.md](plan.md)

Design only. Covers FR-003 to FR-005, FR-013, FR-022, FR-109, FR-114, FR-127, NFR-001, Constitution V. This is the "documented authentication assumptions, rate limiting, threat scenarios, and security trade-offs" required by POL-SEC-004. It is a design-time model, not a penetration test; no attack has been executed.

## 1. Assets

| ID | Asset | Why it matters |
|----|-------|----------------|
| A1 | Integrity of redirect destinations | A tampered mapping sends users to an attacker |
| A2 | Availability of redirects | Core function |
| A3 | Approver credential and the approval record | Whole governance claim rests on agents being unable to approve (DEC-037) |
| A4 | Audit record integrity | Reviewers verify from evidence (FR-130) |
| A5 | Client identifiers and the IP-hash secret | Privacy; scoping of idempotency, rate limits, and count reads |
| A6 | Source repository and the dependency supply chain | Generated code is merged here |
| A7 | Evidence authenticity | A fabricated result would defeat the assessment (Constitution X) |

## 2. Actors and Trust Boundaries

| Actor | Trust |
|-------|-------|
| Anonymous API consumer | Untrusted |
| Short-link visitor | Untrusted |
| Human approver and engineer | Trusted, authenticated by the approver credential |
| AI agent | **Semi-trusted and bounded**: acts only within its role scope; cannot approve; its output is untrusted until reviewed (G-CODE) |
| Assessment reviewer | Read-only (reader credential) |
| Package index and scan-data sources | Untrusted network dependencies |

| Boundary | Between | Controls |
|----------|---------|----------|
| TB-1 | Internet or local client and the shortener API | Input validation, rate limiting, problem-detail errors that leak nothing |
| TB-2 | Shortener process and PostgreSQL and Redis | Parameterized SQL only; a least-privilege database role per plane (no `UPDATE` or `DELETE` on audit tables); Redis bound to loopback with a password and holding only cache data; no raw addresses stored |
| TB-3 | Human approver and the control-plane API | Approver credential; decision bound to subject hash |
| TB-4 | Agent processes and the control-plane API | Agent credential; role-scoped actions; denied and audited when out of scope |
| TB-5 | External-work inbox and outbox (filesystem) | Content-addressed packages; submission validated against the node's output schema and hash; path checks (no traversal) |
| TB-6 | Working repository and generated patches | Patches applied only after G-CODE; no automatic merge or deploy |
| TB-7 | Scanners and the package index | Hash-pinned lock file; allow-list; offline fallback labelled |

## 3. Application Plane Controls

### 3.1 Input validation and normalization (FR-002 to FR-005, NFR-001)

- Only `url` and `expires_at` are accepted; unknown fields are rejected (`malformed_request`; relative-expiry names give `unsupported_expiry_representation`).
- URL length at most 2048 characters; URL must parse; scheme exactly `http` or `https` (case-insensitive, then lowercased); host present and ASCII (PA-006); no user information (PA-007); no control characters or whitespace (prevents header injection when the URL is placed in `Location`).
- Normalization is the three allowed transformations only (data-model.md section 4.1); the stored value is what is redirected to.
- Idempotency key: 1 to 128 visible ASCII characters (PA-004).

### 3.2 Allowed schemes and malicious redirect considerations

`javascript:`, `data:`, `file:`, `ftp:`, `ws:`, `vbscript:`, and any other scheme are rejected. Redirects are always temporary with `Cache-Control: no-store`. The service never follows or fetches a destination, so it cannot be used to make requests (no server-side request forgery from the service itself).

### 3.3 Internal and local address considerations (FR-005)

See data-model.md section 2.4: loopback, private, link-local, unique-local, multicast, reserved, and unspecified IP literals (all textual forms normalized first), `localhost`, `.localhost`, `.local`, `.internal`, and the service's own public host and port are rejected. Residual risk R-18: DNS rebinding and hostnames that resolve to private addresses are not detected, because there is no resolution at creation. This is disclosed, not hidden.

### 3.4 Abuse cases

| ID | Abuse case | Control | Test |
|----|------------|---------|------|
| AB-01 | Destination is an internal address or the service itself | Destination policy | Security test with IPv4, IPv6, mapped, decimal, octal, hex forms |
| AB-02 | `javascript:` or `data:` payload | Scheme allow-list | Security test |
| AB-03 | CR or LF in the URL to inject headers | Control-character rejection; strict `Location` construction | Security test |
| AB-04 | Enumerating short codes | CSPRNG codes, 62^7 keyspace (ASM-015), identical 404 for unknown and malformed, rate limiting. No numeric guess-resistance target is claimed. | Statistical sanity test on generated codes (no sequence), uniform 404 test |
| AB-05 | Discarding tokens to evade rate limits | Dual-dimension limiting (DEC-057): per-IP-hash limit unaffected by tokens | Token-discard test |
| AB-06 | Idempotency-key probing to read another client's response | Key scoped per client; response replayed only to the same client identifier. Clients sharing an IP hash share an identifier (OD-02, proposed LIM-004). | Cross-client test; documented limitation test |
| AB-07 | Flooding with `IN_PROGRESS` keys to exhaust storage | 60 s lease; per-client rate limit; reaper | Lease and reaper test |
| AB-08 | Inflating analytics (repeat visits, HEAD or prefetch) | Counts successful redirects only; rate limiting on resolution; the HEAD semantics are an SCN-A clarification topic | SCN-A test |
| AB-09 | Oversized or malformed bodies | Size limits, JSON parse errors mapped to `malformed_request` | Fuzz-ish property test |
| AB-10 | Homograph and internationalized hostnames | Non-ASCII hosts rejected (PA-006) | Security test |
| AB-11 | Log injection through the URL or headers | URLs are not logged; header values are not logged; structured logging escapes values | Log test |
| AB-12 | Open-redirect abuse for phishing | Inherent to a shortener. Mitigations: scheme allow-list, no destination fetching. No reputation checking exists; a `DestinationReputationPort` with a no-op default is backlog BL-07. Disclosed residual risk R-19. | n/a (disclosed) |

### 3.5 Privacy

- The raw IP address is never stored or logged; only a keyed hash (HMAC-SHA-256 with a server secret, truncated to 128 bits) is kept as the first-contact identifier (POL-PRV-001).
- Analytics hold only count and timestamp; per-event rows are purged at 30 days (ASM-016, DEC-055).
- No user agent, referrer, or address is stored. Stored fields are checked against an approved list by a test (POL-PRV-001).
- The hash secret never appears in logs; rotating it changes first-contact identifiers (documented; tokens keep working because they bind to the client record, not the hash).

### 3.6 Authentication assumptions

The shortener is **anonymous by decision** (DEC-010). There is no user authentication. Anyone can create links; ownership is limited to the client identifier (session token or IP hash). The operational endpoints `/metrics` and the framework documentation endpoints are bound to the loopback interface and disabled in the default profile. The shortener runs over plain HTTP on loopback for the local prototype; transport security is out of scope for the single-node demonstration and is a production requirement (recorded trade-off T-1).

### 3.7 Rate limiting

Dual dimension: per session token and per IP-address hash; thresholds from PVT-006 for tokens and PA-001 for IP hashes. Redis token buckets updated by an atomic script that takes the time from the `Clock` port (ADR-011). Trade-offs: bucket state resets if Redis restarts; if Redis is unavailable the service falls back to PostgreSQL-based rate limiting (DEC-067, PA-011 as amended; still limiting, never silently open) and the degradation is logged, counted, and shown in readiness; clients sharing an address share the IP-hash limit (LIM-003); on a single local machine every tokenless client shares one IP hash. `X-Forwarded-For` is honored only when a trusted-proxy setting is enabled (default off), so a client cannot spoof its address.

## 4. Control Plane Controls

### 4.1 Authentication, least privilege, and the human-approval proof (DEC-037, ADR-007)

| Credential | Held by | May |
|------------|---------|-----|
| APPROVER | The human only | Create runs; decide gates; answer clarifications; decide exceptions; cancel; resume |
| AGENT | Agent processes | Claim and submit work items; propose exceptions and changes; read |
| READER | Assessment reviewer | Read only |

Controls: credentials are 256-bit random values generated by `orch init`, shown once, stored only as SHA-256 hashes (`credentials`), compared in constant time, and never logged. The approver credential lives in `.secrets/` (git-ignored) or the human's environment; an agent worker refuses to start if the approver credential is present in its environment. Approval decisions bind to the subject hash, so an approval cannot be replayed against changed content. Every denied attempt is audited (`APPROVAL_DENIED`, `AGENT_ACTION_DENIED`).

### 4.2 Threats (STRIDE summary)

| ID | Threat | Category | Control | Test |
|----|--------|----------|---------|------|
| TH-01 | An agent approves its own work | Elevation of privilege | Credential separation; 403; audit | FR-109 and FR-114 tests |
| TH-02 | The approver credential leaks into logs, artifacts, or evidence | Information disclosure | Redaction; secret scan of the repo and evidence; log tests | Secret-scan and log tests |
| TH-03 | An approval is replayed for changed content | Tampering | Subject-hash binding; `approval_subject_changed` | Approval tests |
| TH-04 | Audit records are edited or deleted | Tampering, repudiation | Append-only triggers; hash chain; verify; safe-stop on break | Tamper tests (FI-13) |
| TH-05 | A database superuser or an out-of-band restore rewrites the audit tables, including the chain | Tampering | Detectable only against an externally held hash: the final summary records the chain head hash per run in the evidence bundle; signed events are backlog BL-03. Residual risk R-09. | Verify against bundle test |
| TH-06 | **Prompt injection via requirement text**: the untrusted requirement or a clarification answer instructs an agent to exceed its scope | Elevation, tampering | Agents are bounded by role scope and the credential; output is validated against schemas; nothing is applied before G-CODE; the agent never holds the approver credential or merge rights | Scoped-action tests with a hostile requirement fixture |
| TH-07 | A generated patch adds a malicious or unapproved dependency | Tampering, supply chain | POL-DEP-001 allow-list; lock file with integrity hashes and `npm ci`; `npm audit`; G-CODE review | Dependency-policy test |
| TH-08 | A generated patch writes a secret into the repository | Information disclosure | `secretlint` scan; POL-SEC-002 | Seeded-secret negative control |
| TH-09 | A forged work submission claims `LIVE_EXTERNAL` for scripted output | Spoofing | Mode labels set by the engine from the adapter that delivered the submission, not by the submitter; POL-TRC-002 | Mode-label tests |
| TH-10 | Path traversal through work-package or artifact references | Tampering | Content-addressed storage; references validated as hashes, never paths | Traversal test |
| TH-11 | Replay of a work submission | Tampering | Idempotent on `(work_item_id, content_hash)` | Idempotency test |
| TH-12 | Denial of service by flooding the control plane | Denial of service | Loopback binding; request size limits; bounded queues | Limits test |
| TH-13 | A policy exception granted for a non-waivable policy | Elevation | `exception_allowed=false` enforced in code and catalogue tests | Exception tests |
| TH-14 | Redis cache poisoning or a stale replay entry changes an outcome | Tampering | Redis is only an accelerator (ADR-015): the PostgreSQL record is authoritative for every write decision, the cache is written after the commit, entries are bound to the client and signature, Redis requires a password and listens on loopback only | Stale and poisoned cache tests |
| TH-15 | Redis outage used to bypass rate limiting | Denial of service, abuse | Falls back to PostgreSQL-based limiting, never open; the degradation is audited | Redis-down test |
| TH-16 | A malicious or typosquatted npm package enters the dependency tree | Tampering, supply chain | Direct-dependency allow-list, lock file integrity hashes, `npm ci`, `npm audit`, license check, G-CODE review of any dependency change, no install scripts run from untrusted new packages without review | Dependency-policy tests |

### 4.3 Secrets management

| Secret | Generation | Storage | Rotation | Never appears in |
|--------|------------|---------|----------|------------------|
| Approver, agent, reader credentials | `node:crypto` `randomBytes(32)` or stronger, URL-safe encoded, at `orch init` | `.secrets/` (git-ignored) shown once; hashes in the database | `orch credentials rotate <role>` revokes and reissues, audited | Logs, audit data, artifacts, metrics labels, git history |
| IP-hash secret | Random 256-bit at first start | `.secrets/` | Rotation documented (changes first-contact identifiers) | Same |
| Session tokens | 32 random bytes (PA-005) | Only SHA-256 hashes | Not rotated; clients may request a fresh one | Same |

**CLI credentials and evidence (DEC-110, DEC-112).** The CLI reads credentials only from environment variables (`APPROVER_IDENTITY` for the identity string; `APPROVER_CREDENTIAL`, `AGENT_CREDENTIAL`, or `READER_CREDENTIAL` for the secret; the secret variable names were confirmed by the human), with no configuration files and no prompts. Environment variables are inherited by child processes, which is the main residual leakage path (R-10); the agent-worker startup check refuses to run when `APPROVER_CREDENTIAL` is present. `evidence/` is committed to the GitHub repository for reviewer access, so the secret scan covers it and no secret, `.secrets/` content, or database dump may be committed.

A pre-commit and release scan (`secretlint`) enforces this; the release gate includes a seeded fake secret negative control to show the scanner would fail the build.

### 4.4 Dependency risk

Direct dependencies are few and listed in an allow-list file reviewed at G-ARCH and G-CODE; the lock file pins hashes; `npm audit` and `license-checker-rseidelsohn` run in N12 and in the local `verify` command (there is no CI platform, DEC-099); any unresolved high or critical finding fails POL-SEC-005 and blocks release readiness (DEC-054). Dependencies with native extensions are avoided where practical. Residual risk R-20: advisory data is only as current as the last (possibly offline) scan, which the evidence labels.

### 4.5 Audit integrity

Append-only triggers, per-run SHA-256 chain, and a verify command (ADR-006). The chain proves internal consistency, not authorship; see TH-05 and R-09.

## 5. Secure Defaults

Bind to `127.0.0.1`; debug and the framework documentation pages off; `X-Forwarded-For` ignored; `/metrics` loopback only; strict JSON parsing; generic error bodies; no secrets in configuration files; file mode restrictions on `.secrets/` documented for Windows and POSIX; PostgreSQL and Redis listen on loopback only with credentials generated by `orch init`; the application roles have the minimum privileges (no DDL, no `UPDATE` or `DELETE` on audit tables); a startup self-check refuses unsafe settings (for example a non-loopback bind without an explicit override flag).

## 6. Residual Risks and Trade-offs (disclosed)

| ID | Risk or trade-off | Disposition |
|----|-------------------|-------------|
| T-1 | No TLS on the local prototype | Accepted for loopback demonstration; production requirement |
| R-09 | A superuser-level rewrite of the audit tables is only detectable against an external chain head | Disclosed; BL-03 |
| R-18 | DNS-rebinding and resolving hostnames are not blocked | Disclosed |
| R-19 | No destination reputation checking | Disclosed; BL-07 |
| R-20 | Scan data may be offline or stale | Evidence is labelled |
| OD-02 / LIM-004 (proposed) | Clients sharing an IP-address hash share one client identity, including count reads and idempotency scope | Needs the human's decision (plan.md PD-03) |
| LIM-001 to LIM-003 | From the specification | Already recorded |
