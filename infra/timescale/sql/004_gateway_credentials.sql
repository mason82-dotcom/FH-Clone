-- Gateway credentials authenticate MQTT principals only.
-- They MUST NOT be used to reconstruct runtime gateway↔aircraft topology,
-- active DRC sessions, FC stage, control leases or DJI authority state.
CREATE TABLE IF NOT EXISTS gateway_credentials (
  principal_id    UUID PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  gateway_sn      TEXT NOT NULL UNIQUE,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gateway_credentials_enabled_idx
  ON gateway_credentials (enabled)
  WHERE enabled = TRUE;
