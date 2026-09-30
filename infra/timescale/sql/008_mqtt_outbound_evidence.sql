-- Passive evidence for MQTT messages that FH2 actually published.
-- This table is diagnostic only and MUST NOT be used as a source of
-- authorization, control authority, DRC session state or command replay.
-- device_id contains only a SHA-256 correlation value and channel contains a
-- redacted product identifier; raw gateway/aircraft serials must not be stored.
CREATE TABLE IF NOT EXISTS mqtt_outbound_messages (
  observed_at  TIMESTAMPTZ NOT NULL,
  adapter_id   TEXT NOT NULL,
  transport    TEXT NOT NULL CHECK (transport IN ('basic', 'drc')),
  device_id    TEXT,
  channel      TEXT NOT NULL,
  qos          SMALLINT NOT NULL CHECK (qos BETWEEN 0 AND 1),
  method       TEXT,
  payload      JSONB NOT NULL
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'observed_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'transport, adapter_id',
  tsdb.orderby = 'observed_at DESC'
);

CREATE INDEX IF NOT EXISTS mqtt_outbound_channel_time_idx
  ON mqtt_outbound_messages (channel, observed_at DESC);

CREATE INDEX IF NOT EXISTS mqtt_outbound_method_time_idx
  ON mqtt_outbound_messages (method, observed_at DESC)
  WHERE method IS NOT NULL;

CREATE INDEX IF NOT EXISTS mqtt_outbound_device_time_idx
  ON mqtt_outbound_messages (device_id, observed_at DESC)
  WHERE device_id IS NOT NULL;

-- Outbound evidence is intended for short-lived operational/hardware
-- qualification. Long-term telemetry history remains in the existing stores.
SELECT add_retention_policy(
  'mqtt_outbound_messages',
  drop_after => INTERVAL '30 days',
  if_not_exists => true
);
