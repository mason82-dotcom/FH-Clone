-- Authorization audit is a sink only. It MUST NOT be queried by the
-- runtime authorizer to reconstruct gateway topology or DRC session state.
CREATE TABLE IF NOT EXISTS authz_audit (
  time              TIMESTAMPTZ NOT NULL,
  decision          TEXT NOT NULL
                    CHECK (decision IN ('allow', 'deny', 'ignore')),
  reason            TEXT NOT NULL
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
                      'internal_token_mismatch',
                      'internal_token_mismatch'
                    )),
  action            TEXT NOT NULL
                    CHECK (action IN ('publish', 'subscribe')),
  topic             TEXT NOT NULL,
  qos               SMALLINT CHECK (qos IS NULL OR qos BETWEEN 0 AND 2),

  username          TEXT,
  client_id         TEXT,
  peer_ip           INET,

  gateway_sn        TEXT,
  aircraft_sn       TEXT,
  drc_session_id    UUID,
  mission_id        UUID,

  cache_hit         BOOLEAN,
  latency_us        INTEGER CHECK (latency_us IS NULL OR latency_us >= 0)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'time',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'decision, gateway_sn',
  tsdb.orderby = 'time DESC'
);

CREATE INDEX IF NOT EXISTS authz_audit_gateway_time_idx
  ON authz_audit (gateway_sn, time DESC)
  WHERE gateway_sn IS NOT NULL;

CREATE INDEX IF NOT EXISTS authz_audit_reason_time_idx
  ON authz_audit (reason, time DESC);

CALL add_columnstore_policy(
  'authz_audit',
  after => INTERVAL '30 days',
  if_not_exists => true
);

SELECT add_retention_policy(
  'authz_audit',
  drop_after => INTERVAL '24 months',
  if_not_exists => true
);

CREATE MATERIALIZED VIEW IF NOT EXISTS authz_deny_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', time) AS bucket,
  gateway_sn,
  count(*) FILTER (WHERE decision = 'deny')  AS denies,
  count(*) FILTER (WHERE decision = 'allow') AS allows,
  avg(latency_us)                             AS avg_latency_us
FROM authz_audit
GROUP BY
  time_bucket(INTERVAL '1 hour', time),
  gateway_sn
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'authz_deny_1h',
  start_offset => INTERVAL '2 days',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes'
);
