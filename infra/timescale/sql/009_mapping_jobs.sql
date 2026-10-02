-- V3.1 mapping/photogrammetry scheduler foundation.
-- Ported conceptually from AeroNexus mapping-tool, adapted to FH-Clone's
-- PostgreSQL/TimescaleDB persistence boundary and normalized media_assets.

CREATE TABLE IF NOT EXISTS mapping_jobs (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  status          TEXT NOT NULL
                  CHECK (status IN ('QUEUED', 'CLAIMED', 'RUNNING', 'DONE', 'FAILED')),
  asset_ids       TEXT[] NOT NULL CHECK (cardinality(asset_ids) > 0),
  options         JSONB NOT NULL DEFAULT '{}'::jsonb,
  mission_id      TEXT,
  device_sn       TEXT,
  created_by      TEXT NOT NULL DEFAULT 'api',
  agent_id        TEXT,
  lease_until     TIMESTAMPTZ,
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  progress        DOUBLE PRECISION NOT NULL DEFAULT 0
                  CHECK (progress >= 0 AND progress <= 100),
  message         TEXT,
  error           TEXT,
  claimed_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('CLAIMED', 'RUNNING') AND agent_id IS NOT NULL AND lease_until IS NOT NULL)
    OR
    (status NOT IN ('CLAIMED', 'RUNNING'))
  )
);

CREATE INDEX IF NOT EXISTS mapping_jobs_status_created_idx
  ON mapping_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS mapping_jobs_mission_created_idx
  ON mapping_jobs (mission_id, created_at DESC)
  WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mapping_jobs_device_created_idx
  ON mapping_jobs (device_sn, created_at DESC)
  WHERE device_sn IS NOT NULL;

CREATE TABLE IF NOT EXISTS mapping_results (
  id              BIGSERIAL PRIMARY KEY,
  job_id          UUID NOT NULL REFERENCES mapping_jobs(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                  CHECK (kind IN (
                    'orthophoto_cog',
                    'dsm_cog',
                    'dtm_cog',
                    'report',
                    'log',
                    'manifest',
                    'other'
                  )),
  object_key      TEXT NOT NULL,
  sha256          TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes      BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, object_key)
);

CREATE TABLE IF NOT EXISTS mapping_layers (
  id              UUID PRIMARY KEY,
  job_id          UUID REFERENCES mapping_jobs(id) ON DELETE SET NULL,
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  layer_type      TEXT NOT NULL DEFAULT 'xyz'
                  CHECK (layer_type IN ('xyz', 'cog')),
  object_prefix   TEXT NOT NULL,
  tile_format     TEXT,
  min_zoom        INTEGER,
  max_zoom        INTEGER,
  bounds_wgs84    JSONB,
  crs             TEXT,
  opacity         DOUBLE PRECISION NOT NULL DEFAULT 0.8
                  CHECK (opacity >= 0 AND opacity <= 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    layer_type <> 'xyz'
    OR (
      tile_format IS NOT NULL
      AND min_zoom IS NOT NULL
      AND max_zoom IS NOT NULL
      AND min_zoom <= max_zoom
    )
  )
);

CREATE INDEX IF NOT EXISTS mapping_layers_created_idx
  ON mapping_layers (created_at DESC);
