CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- Mission metadata: relational, small, retained independently
-- from raw telemetry retention.
-- ============================================================
CREATE TABLE IF NOT EXISTS missions (
  mission_id          UUID PRIMARY KEY,
  source              TEXT NOT NULL CHECK (source IN ('automatic', 'manual')),
  gateway_sn          TEXT,
  drone_sn            TEXT NOT NULL,

  -- DJI product identity from update_topo.
  product_domain      SMALLINT,
  device_type         SMALLINT,
  device_sub_type     SMALLINT,

  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  end_reason          TEXT,
  pilot               TEXT,

  -- Non-sensitive RTK source metadata only.
  rtk_source_label    TEXT,
  rtk_provider        TEXT,
  rtk_configured_via  TEXT,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS missions_drone_started_idx
  ON missions (drone_sn, started_at DESC);

CREATE INDEX IF NOT EXISTS missions_gateway_started_idx
  ON missions (gateway_sn, started_at DESC)
  WHERE gateway_sn IS NOT NULL;

-- ============================================================
-- Raw telemetry: TimescaleDB hypertable / Hypercore.
-- One-day chunks are appropriate for the current aircraft rates,
-- while mission_id + drone_sn are the primary analytical filters.
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry (
  time                TIMESTAMPTZ NOT NULL,
  mission_id          UUID NOT NULL
                      REFERENCES missions(mission_id) ON DELETE CASCADE,
  drone_sn            TEXT NOT NULL,

  -- Position
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  height_ellipsoid    REAL,
  elevation_relative  REAL,
  horizontal_speed    REAL,
  vertical_speed      REAL,

  -- Attitude
  attitude_head       REAL,
  attitude_pitch      REAL,
  attitude_roll       REAL,

  -- RTK / GNSS
  is_fixed            SMALLINT,
  quality             SMALLINT,
  gps_number          SMALLINT,
  rtk_number          SMALLINT,
  mode_code           SMALLINT,

  -- System / payload
  battery_percent     SMALLINT,
  gimbal_pitch        REAL,
  gimbal_yaw          REAL,
  camera_state        SMALLINT
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'time',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'mission_id, drone_sn',
  tsdb.orderby = 'time DESC'
);

CREATE INDEX IF NOT EXISTS telemetry_mission_time_idx
  ON telemetry (mission_id, time DESC);

CREATE INDEX IF NOT EXISTS telemetry_drone_time_idx
  ON telemetry (drone_sn, time DESC);

-- Move cold raw chunks to the Hypercore columnstore after seven days.
CALL add_columnstore_policy('telemetry', after => INTERVAL '7 days');

-- Raw telemetry retention. Mission metadata and continuous aggregates remain.
SELECT add_retention_policy(
  'telemetry',
  drop_after => INTERVAL '24 months',
  if_not_exists => true
);

-- ============================================================
-- One-minute post-flight aggregate.
--
-- The refresh window is intentionally short (2h). Old raw chunks that are
-- dropped by the 24-month retention policy fall outside this refresh window,
-- so historical aggregate rows are not invalidated by normal retention.
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', time) AS bucket,
  mission_id,
  drone_sn,

  avg(latitude)                         AS latitude,
  avg(longitude)                        AS longitude,
  avg(height_ellipsoid)                 AS height_ellipsoid,
  avg(elevation_relative)               AS elevation_relative,
  avg(horizontal_speed)                 AS horizontal_speed,
  avg(vertical_speed)                   AS vertical_speed,

  min(battery_percent)                  AS battery_min,
  max(battery_percent)                  AS battery_max,

  round(avg(gps_number))::smallint      AS gps_avg,
  round(avg(rtk_number))::smallint      AS rtk_avg,

  count(*) FILTER (WHERE is_fixed = 0)  AS fix_not_started_samples,
  count(*) FILTER (WHERE is_fixed = 1)  AS fix_fixing_samples,
  count(*) FILTER (WHERE is_fixed = 2)  AS fix_ok_samples,
  count(*) FILTER (WHERE is_fixed = 3)  AS fix_failed_samples,
  count(*) FILTER (WHERE quality = 10)  AS rtk_quality_samples,
  count(*)                              AS total_samples,

  avg(attitude_head)                    AS attitude_head,
  avg(gimbal_pitch)                     AS gimbal_pitch
FROM telemetry
GROUP BY
  time_bucket(INTERVAL '1 minute', time),
  mission_id,
  drone_sn
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'telemetry_1m',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute'
);
