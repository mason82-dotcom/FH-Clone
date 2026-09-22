-- Extend the persisted AuthZ reason contract for existing databases.
-- Fresh databases already receive the same value from 003_authz_audit.sql.
--
-- PostgreSQL's docker-entrypoint-initdb.d scripts only run when a new data
-- directory is initialized. Existing deployments must apply this migration
-- explicitly before the Control API starts emitting internal_token_mismatch.
ALTER TABLE authz_audit
  DROP CONSTRAINT IF EXISTS authz_audit_reason_check;

ALTER TABLE authz_audit
  ADD CONSTRAINT authz_audit_reason_check
  CHECK (reason IN (
    'no_match',
    'gateway_own_topic',
    'gateway_topology_mismatch',
    'webui_read_only',
    'webui_topic_out_of_scope',
    'drc_session_active',
    'drc_session_inactive',
    'drc_backend_publish',
    'internal_error',
    'internal_token_mismatch'
  ));
