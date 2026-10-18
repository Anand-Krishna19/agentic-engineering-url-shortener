-- T003: schema for both planes (data-model.md sections 2 and 3; ADR-003, ADR-018, DEC-095).
-- Executed once by the PostgreSQL entrypoint as the bootstrap superuser `app`.
-- Tables stay owned by `app`; the application roles (002-roles.sql) get DML only.
-- Scope: application-plane tables and the control-plane workflow/audit tables. Remaining
-- control-plane tables arrive with the orchestrator tasks that need them.

-- Shared append-only guard (ADR-006): blocks UPDATE, DELETE and TRUNCATE even for the owner.
CREATE FUNCTION forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% not permitted)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- ---------------------------------------------------------------------------
-- Application plane: database urlshortener (DEC-113)
-- ---------------------------------------------------------------------------

CREATE TABLE clients (
  client_id  text PRIMARY KEY,
  ip_hash    text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE short_links (
  short_code        text COLLATE "C" PRIMARY KEY
                    CONSTRAINT short_code_base62_7 CHECK (short_code ~ '^[0-9A-Za-z]{7}$'),
  normalized_url    text NOT NULL
                    CONSTRAINT normalized_url_max_2048 CHECK (char_length(normalized_url) <= 2048),
  creator_client_id text NOT NULL REFERENCES clients (client_id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  expiry_source     text NOT NULL CHECK (expiry_source IN ('SUPPLIED', 'DEFAULT'))
);

CREATE TABLE redirect_counters (
  short_code     text COLLATE "C" PRIMARY KEY REFERENCES short_links (short_code),
  redirect_count integer NOT NULL DEFAULT 0 CHECK (redirect_count >= 0)
);

CREATE TABLE redirect_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_code  text COLLATE "C" NOT NULL REFERENCES short_links (short_code),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redirect_events_occurred_at_idx ON redirect_events (occurred_at);

CREATE TABLE idempotency_records (
  client_id        text NOT NULL REFERENCES clients (client_id),
  idempotency_key  text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  signature        text NOT NULL,
  state            text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  request_id       text NOT NULL,
  lease_expires_at timestamptz,
  terminal_at      timestamptz,
  retention_until  timestamptz,
  response_status  integer,
  response_body    text,
  short_code       text COLLATE "C" REFERENCES short_links (short_code),
  PRIMARY KEY (client_id, idempotency_key)
);
CREATE INDEX idempotency_records_lease_idx ON idempotency_records (lease_expires_at)
  WHERE state = 'IN_PROGRESS';
CREATE INDEX idempotency_records_retention_idx ON idempotency_records (retention_until)
  WHERE state <> 'IN_PROGRESS';

CREATE TABLE app_audit_events (
  event_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  request_id     text,
  correlation_id text,
  action         text NOT NULL,
  subject        text,
  result         text NOT NULL,
  reason         text
);
CREATE TRIGGER app_audit_events_no_mutation
  BEFORE UPDATE OR DELETE ON app_audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER app_audit_events_no_truncate
  BEFORE TRUNCATE ON app_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

-- ---------------------------------------------------------------------------
-- Control plane: database orchestrator (separate data ownership, ADR-003/ADR-016)
-- ---------------------------------------------------------------------------

CREATE DATABASE orchestrator;
\connect orchestrator

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% not permitted)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TABLE workflow_runs (
  run_id                   text PRIMARY KEY,
  profile                  text NOT NULL,
  scenario_tag             text NOT NULL DEFAULT 'NONE'
                           CHECK (scenario_tag IN ('SCN-A', 'SCN-B', 'SCN-C', 'TEST', 'NONE')),
  agent_mode               text NOT NULL
                           CHECK (agent_mode IN ('LIVE_EXTERNAL', 'SCRIPTED', 'MIXED')),
  status                   text NOT NULL DEFAULT 'CREATED'
                           CHECK (status IN ('CREATED', 'RUNNING', 'SAFE_STOPPED', 'COMPLETED', 'CANCELLED')),
  release_outcome          text CHECK (release_outcome IN ('READY', 'NOT_READY')),
  terminal_reason          text,
  current_plan_version     integer,
  policy_catalogue_version text,
  parent_run_id            text REFERENCES workflow_runs (run_id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  terminal_at              timestamptz,
  clock_kind               text
);

CREATE TABLE audit_events (
  event_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         text NOT NULL REFERENCES workflow_runs (run_id),
  seq            integer NOT NULL CHECK (seq >= 1),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  clock_kind     text,
  actor_type     text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id       text,
  role_string    text,
  credential_id  text,
  action         text NOT NULL,
  subject_type   text,
  subject_id     text,
  from_state     text,
  to_state       text,
  result         text NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED', 'REJECTED', 'NOOP')),
  reason         text,
  policy_version text,
  correlation_id text,
  causation_id   text,
  data           jsonb,
  prev_hash      text NOT NULL,
  hash           text NOT NULL,
  UNIQUE (run_id, seq)
);
CREATE TRIGGER audit_events_no_mutation
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

-- Node (stage) state of a run, persisted so a run resumes from the database (FR-107, ADR-018).
CREATE TABLE workflow_nodes (
  run_id         text NOT NULL REFERENCES workflow_runs (run_id),
  node_key       text NOT NULL,
  state          text NOT NULL DEFAULT 'PENDING',
  attempt_count  integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  branch         text,
  blocked_by     jsonb NOT NULL DEFAULT '[]',
  reason         text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, node_key)
);
