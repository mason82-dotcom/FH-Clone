-- Durable revocation list for FH2 Android/MSDK agent tokens.
-- Stores only SHA-256 token digests; raw bearer tokens are never persisted.
-- This is pairing/transport state and MUST NOT reconstruct FC stage,
-- control leases, DJI authority or active control sessions.
CREATE TABLE IF NOT EXISTS msdk_token_revocations (
  token_hash  TEXT PRIMARY KEY,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS msdk_token_revocations_expires_idx
  ON msdk_token_revocations (expires_at);
