-- Persistent normalized media assets.
-- Only validated/sanitized MediaAsset payloads are written by the Control API.
-- Runtime control rights and credentials MUST NOT be represented here.
CREATE TABLE IF NOT EXISTS media_assets (
  asset_id       TEXT PRIMARY KEY,
  device_sn      TEXT NOT NULL,
  sensor_id      TEXT NOT NULL,
  sensor_kind    TEXT NOT NULL
                 CHECK (sensor_kind IN ('rgb', 'thermal', 'multispectral', 'unknown')),
  profile        TEXT NOT NULL
                 CHECK (profile IN ('GENERIC', 'RGB', 'THERMAL', 'MULTISPECTRAL', 'NDVI')),
  captured_at    TIMESTAMPTZ,
  mission_id     TEXT,
  payload_id     TEXT,
  latitude       DOUBLE PRECISION
                 CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude      DOUBLE PRECISION
                 CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  asset          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_device_capture_idx
  ON media_assets (device_sn, captured_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_mission_capture_idx
  ON media_assets (mission_id, captured_at DESC)
  WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_assets_profile_capture_idx
  ON media_assets (profile, captured_at DESC);
