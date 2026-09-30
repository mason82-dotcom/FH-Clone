#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${FH2_COMPOSE_FILE:-infra/timescale/compose.yaml}"
ENV_FILE="${FH2_ENV_FILE:-infra/timescale/.env}"
DB_USER="${FH2_DB_USER:-fhclone}"
DB_NAME="${FH2_DB_NAME:-fhclone}"
RESTORE_DB="fhclone_restore_verify"
BACKUP_FILE="${TMPDIR:-/tmp}/fh2-timescale-restore-gate-$$.dump"
MARKER="fh2-backup-restore-$$"
MISSION_ID="11111111-1111-4111-8111-111111111111"
PRINCIPAL_ID="22222222-2222-4222-8222-222222222222"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cleanup() {
  compose exec -T timescaledb psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
DELETE FROM mqtt_outbound_messages WHERE device_id = '$MARKER';
DELETE FROM normalized_parameters WHERE device_id = '$MARKER-device';
DELETE FROM raw_messages WHERE device_id = '$MARKER-device';
DELETE FROM media_assets WHERE asset_id = '$MARKER';
DELETE FROM authz_audit WHERE gateway_sn = '$MARKER';
DELETE FROM msdk_token_revocations WHERE token_hash = '$MARKER';
DELETE FROM gateway_credentials WHERE principal_id = '$PRINCIPAL_ID';
DELETE FROM dji_gateway_devices WHERE device_sn = '$MARKER-device';
DELETE FROM dji_gateways WHERE gateway_sn = '$MARKER';
DELETE FROM telemetry WHERE mission_id = '$MISSION_ID';
DELETE FROM missions WHERE mission_id = '$MISSION_ID';
SQL
  compose exec -T timescaledb dropdb -U "$DB_USER" --force "$RESTORE_DB" >/dev/null 2>&1 || true
  rm -f "$BACKUP_FILE"
}
trap cleanup EXIT INT TERM

compose exec -T timescaledb psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO missions (
  mission_id, source, gateway_sn, drone_sn, started_at, ended_at, end_reason
) VALUES (
  '$MISSION_ID', 'automatic', '$MARKER', '$MARKER-device', NOW() - INTERVAL '1 minute', NOW(), 'manual'
);

INSERT INTO telemetry (time, mission_id, drone_sn, latitude, longitude, is_fixed)
VALUES (NOW(), '$MISSION_ID', '$MARKER-device', 49.0, 8.0, 2);

INSERT INTO authz_audit (
  time, decision, reason, action, topic, gateway_sn
) VALUES (
  NOW(), 'deny', 'no_match', 'publish', 'verify/$MARKER', '$MARKER'
);

INSERT INTO gateway_credentials (
  principal_id, username, password_hash, gateway_sn, enabled
) VALUES (
  '$PRINCIPAL_ID', '$MARKER-user', 'test-hash-not-a-secret', '$MARKER', FALSE
);

INSERT INTO dji_gateways (
  gateway_sn, product_domain, product_type, product_sub_type, observed_at
) VALUES (
  '$MARKER', '2', 144, 0, NOW()
);

INSERT INTO dji_gateway_devices (
  device_sn, gateway_sn, product_domain, product_type, product_sub_type, observed_at
) VALUES (
  '$MARKER-device', '$MARKER', '0', 77, 0, NOW()
);

INSERT INTO msdk_token_revocations (token_hash, revoked_at, expires_at)
VALUES ('$MARKER', NOW(), NOW() + INTERVAL '1 hour');

INSERT INTO media_assets (
  asset_id, device_sn, sensor_id, sensor_kind, profile, captured_at, asset
) VALUES (
  '$MARKER', '$MARKER-device', 'verify-sensor', 'rgb', 'RGB', NOW(),
  '{"id":"$MARKER","deviceId":"$MARKER-device","sensor":{"id":"verify-sensor","kind":"rgb","confidence":"authoritative"},"processingProfile":"RGB"}'::jsonb
);

INSERT INTO raw_messages (
  received_at, adapter_id, device_id, channel, payload
) VALUES (
  NOW(), 'verify', '$MARKER-device', 'verify/$MARKER', '{"marker":"$MARKER"}'::jsonb
);

INSERT INTO normalized_parameters (
  sampled_at, adapter_id, device_id, key, value, quality
) VALUES (
  NOW(), 'verify', '$MARKER-device', 'verify.marker', '"$MARKER"'::jsonb, 'good'
);

INSERT INTO mqtt_outbound_messages (
  observed_at, adapter_id, transport, device_id, channel, qos, method, payload
) VALUES (
  NOW(), 'dji-cloud', 'basic', '$MARKER', 'sys/product/$MARKER/status_reply', 1,
  'update_topo', '{"tid":"verify","method":"update_topo","data":{"result":0}}'::jsonb
);
SQL

FH2_COMPOSE_FILE="$COMPOSE_FILE" \
FH2_ENV_FILE="$ENV_FILE" \
FH2_DB_USER="$DB_USER" \
FH2_DB_NAME="$DB_NAME" \
  sh scripts/backup-timescale.sh "$BACKUP_FILE"

FH2_COMPOSE_FILE="$COMPOSE_FILE" \
FH2_ENV_FILE="$ENV_FILE" \
FH2_DB_USER="$DB_USER" \
FH2_DB_NAME="$DB_NAME" \
FH2_RESTORE_DATABASE="$RESTORE_DB" \
  sh scripts/restore-timescale.sh "$BACKUP_FILE"

restored="$(compose exec -T timescaledb psql -U "$DB_USER" -d "$RESTORE_DB" -tAc "
SELECT
  (SELECT count(*) FROM missions WHERE mission_id = '$MISSION_ID') || ':' ||
  (SELECT count(*) FROM telemetry WHERE mission_id = '$MISSION_ID') || ':' ||
  (SELECT count(*) FROM authz_audit WHERE gateway_sn = '$MARKER') || ':' ||
  (SELECT count(*) FROM gateway_credentials WHERE principal_id = '$PRINCIPAL_ID' AND enabled = FALSE) || ':' ||
  (SELECT count(*) FROM dji_gateways WHERE gateway_sn = '$MARKER') || ':' ||
  (SELECT count(*) FROM dji_gateway_devices WHERE device_sn = '$MARKER-device') || ':' ||
  (SELECT count(*) FROM msdk_token_revocations WHERE token_hash = '$MARKER') || ':' ||
  (SELECT count(*) FROM media_assets WHERE asset_id = '$MARKER') || ':' ||
  (SELECT count(*) FROM raw_messages WHERE device_id = '$MARKER-device') || ':' ||
  (SELECT count(*) FROM normalized_parameters WHERE device_id = '$MARKER-device') || ':' ||
  (SELECT count(*) FROM mqtt_outbound_messages WHERE device_id = '$MARKER');
" | tr -d '[:space:]')"

if [ "$restored" != "1:1:1:1:1:1:1:1:1:1:1" ]; then
  echo "FEHLER: Restore-Datenpruefung fehlgeschlagen: $restored" >&2
  exit 1
fi

runtime_tables="$(compose exec -T timescaledb psql -U "$DB_USER" -d "$RESTORE_DB" -tAc "
SELECT count(*)
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('drc_sessions','control_leases','control_authority','control_sessions','fc_stage');
" | tr -d '[:space:]')"

if [ "$runtime_tables" != "0" ]; then
  echo "FEHLER: Restore enthaelt unerlaubte Runtime-Control-Tabellen." >&2
  exit 1
fi

echo "TimescaleDB Backup/Restore Gate PASS"
