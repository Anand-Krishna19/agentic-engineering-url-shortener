-- T003: one DML-only application role per plane (DEC-095). No migration role is created or kept.
-- Passwords come from the container environment (see docker-compose.yml and .env.example).

\getenv shortener_pw SHORTENER_APP_PASSWORD
\getenv orchestrator_pw ORCHESTRATOR_APP_PASSWORD

-- Fail loudly (ON_ERROR_STOP) if either password is missing or empty.
SELECT (:'shortener_pw' = '' OR :'orchestrator_pw' = '') AS missing_password \gset
\if :missing_password
  DO $$ BEGIN RAISE EXCEPTION 'SHORTENER_APP_PASSWORD and ORCHESTRATOR_APP_PASSWORD must be set'; END $$;
\endif

CREATE ROLE shortener_app    LOGIN PASSWORD :'shortener_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE orchestrator_app LOGIN PASSWORD :'orchestrator_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- Each plane may connect only to its own database (ADR-016: control plane never reads the shortener DB).
REVOKE ALL ON DATABASE urlshortener FROM PUBLIC;
REVOKE ALL ON DATABASE orchestrator FROM PUBLIC;
GRANT CONNECT ON DATABASE urlshortener TO shortener_app;
GRANT CONNECT ON DATABASE orchestrator TO orchestrator_app;

-- Application plane
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO shortener_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO shortener_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shortener_app;
-- Audit tables are INSERT-only (DEC-095, ADR-006); triggers in 001-schema.sql back this up.
REVOKE UPDATE, DELETE ON app_audit_events FROM shortener_app;

-- Control plane
\connect orchestrator

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orchestrator_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orchestrator_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orchestrator_app;
REVOKE UPDATE, DELETE ON audit_events FROM orchestrator_app;
