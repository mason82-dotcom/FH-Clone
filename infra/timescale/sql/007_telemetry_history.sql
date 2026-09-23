-- Durable adapter telemetry history.
--
-- raw_messages preserves the sanitized manufacturer/protocol payload received
-- by FH2. normalized_parameters preserves every canonical/raw ParameterSample
-- with adapter provenance. Neither table is an authorization source.
CREATE TABLE IF NOT EXISTS raw_messages (
  received_at  TIMESTAMPTZ NOT NULL,
  adapter_id   TEXT NOT NULL,
  device_id    TEXT,
  mission_id   UUID,
  channel      TEXT NOT NULL,
  payload      JSONB NOT NULL
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'received_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'adapter_id',
  tsdb.orderby = 'received_at DESC'
);

CREATE INDEX IF NOT EXISTS raw_messages_device_time_idx
  ON raw_messages (device_id, received_at DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_messages_mission_time_idx
  ON raw_messages (mission_id, received_at DESC)
  WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_messages_channel_time_idx
  ON raw_messages (channel, received_at DESC);

SELECT add_retention_policy(
  'raw_messages',
  drop_after => INTERVAL '24 months',
  if_not_exists => true
);

CREATE TABLE IF NOT EXISTS normalized_parameters (
  sampled_at   TIMESTAMPTZ NOT NULL,
  adapter_id   TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  mission_id   UUID,
  key          TEXT NOT NULL,
  raw_key      TEXT,
  value        JSONB NOT NULL,
  unit         TEXT,
  quality      TEXT NOT NULL
               CHECK (quality IN ('good', 'stale', 'invalid', 'unknown'))
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'sampled_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'device_id, adapter_id',
  tsdb.orderby = 'sampled_at DESC'
);

CREATE INDEX IF NOT EXISTS normalized_parameters_device_key_time_idx
  ON normalized_parameters (device_id, key, sampled_at DESC);

CREATE INDEX IF NOT EXISTS normalized_parameters_mission_time_idx
  ON normalized_parameters (mission_id, sampled_at DESC)
  WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS normalized_parameters_adapter_time_idx
  ON normalized_parameters (adapter_id, sampled_at DESC);

SELECT add_retention_policy(
  'normalized_parameters',
  drop_after => INTERVAL '24 months',
  if_not_exists => true
);
