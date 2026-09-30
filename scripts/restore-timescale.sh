#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${FH2_COMPOSE_FILE:-compose.yaml}"
ENV_FILE="${FH2_ENV_FILE:-.env}"
DB_USER="${FH2_DB_USER:-fhclone}"
SOURCE_DB="${FH2_DB_NAME:-fhclone}"
TARGET_DB="${FH2_RESTORE_DATABASE:-}"
BACKUP="${1:-}"

if [ -z "$BACKUP" ] || [ -z "$TARGET_DB" ]; then
  echo "Verwendung: FH2_RESTORE_DATABASE=<ziel-db> $0 <backup-datei.dump>" >&2
  exit 2
fi

test -s "$BACKUP" || {
  echo "FEHLER: Backup fehlt oder ist leer: $BACKUP" >&2
  exit 1
}

case "$TARGET_DB" in
  *[!A-Za-z0-9_]*|'')
    echo "FEHLER: ungueltiger Datenbankname: $TARGET_DB" >&2
    exit 1
    ;;
esac

if [ "$TARGET_DB" = "$SOURCE_DB" ] && [ "${FH2_ALLOW_INPLACE_RESTORE:-NO}" != "YES" ]; then
  echo "FEHLER: Restore ueber die aktive Quelldatenbank ist standardmaessig gesperrt." >&2
  echo "Fuer einen bewusst geplanten In-Place-Restore: FH2_ALLOW_INPLACE_RESTORE=YES setzen." >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

exists="$(compose exec -T timescaledb psql -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB';" | tr -d '[:space:]')"

if [ "$exists" = "1" ]; then
  if [ "${FH2_RESTORE_REPLACE:-NO}" != "YES" ]; then
    echo "FEHLER: Zieldatenbank existiert bereits: $TARGET_DB" >&2
    echo "Zum bewussten Ersetzen FH2_RESTORE_REPLACE=YES setzen." >&2
    exit 1
  fi
  compose exec -T timescaledb dropdb -U "$DB_USER" --force "$TARGET_DB"
fi

compose exec -T timescaledb createdb -U "$DB_USER" "$TARGET_DB"
restore_ok=0
cleanup_failed_restore() {
  if [ "$restore_ok" -ne 1 ]; then
    compose exec -T timescaledb dropdb -U "$DB_USER" --force "$TARGET_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup_failed_restore EXIT INT TERM

compose exec -T timescaledb psql -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT timescaledb_pre_restore();
SQL

cat "$BACKUP" | compose exec -T timescaledb \
  pg_restore -U "$DB_USER" -d "$TARGET_DB" \
    --no-owner \
    --no-privileges \
    --exit-on-error

compose exec -T timescaledb psql -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT timescaledb_post_restore();
SQL

schema_ok="$(compose exec -T timescaledb psql -U "$DB_USER" -d "$TARGET_DB" -tAc \
  "SELECT CASE WHEN
     to_regclass('public.missions') IS NOT NULL
     AND to_regclass('public.telemetry') IS NOT NULL
     AND to_regclass('public.authz_audit') IS NOT NULL
     AND to_regclass('public.gateway_credentials') IS NOT NULL
     AND to_regclass('public.dji_gateways') IS NOT NULL
     AND to_regclass('public.dji_gateway_devices') IS NOT NULL
     AND to_regclass('public.msdk_token_revocations') IS NOT NULL
     AND to_regclass('public.media_assets') IS NOT NULL
     AND to_regclass('public.raw_messages') IS NOT NULL
     AND to_regclass('public.normalized_parameters') IS NOT NULL
     AND to_regclass('public.mqtt_outbound_messages') IS NOT NULL
   THEN 1 ELSE 0 END;" | tr -d '[:space:]')"

if [ "$schema_ok" != "1" ]; then
  echo "FEHLER: Restore enthaelt nicht das vollstaendige Pflichtschema." >&2
  exit 1
fi

restore_ok=1
trap - EXIT INT TERM
echo "TimescaleDB-Restore erfolgreich nach: $TARGET_DB"
