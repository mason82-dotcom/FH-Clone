#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"
umask 077

COMPOSE_FILE="${FH2_COMPOSE_FILE:-compose.yaml}"
ENV_FILE="${FH2_ENV_FILE:-.env}"
DB_USER="${FH2_DB_USER:-fhclone}"
DB_NAME="${FH2_DB_NAME:-fhclone}"
OUTPUT="${1:-}"

if [ -z "$OUTPUT" ]; then
  echo "Verwendung: $0 <backup-datei.dump>" >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || {
  echo "FEHLER: docker fehlt." >&2
  exit 1
}

test -f "$COMPOSE_FILE" || {
  echo "FEHLER: Compose-Datei fehlt: $COMPOSE_FILE" >&2
  exit 1
}
test -f "$ENV_FILE" || {
  echo "FEHLER: Env-Datei fehlt: $ENV_FILE" >&2
  exit 1
}

output_dir="$(dirname -- "$OUTPUT")"
mkdir -p "$output_dir"

tmp="${OUTPUT}.tmp.$$"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT INT TERM

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T timescaledb \
  pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --format=custom \
    --no-owner \
    --no-privileges >"$tmp"

test -s "$tmp" || {
  echo "FEHLER: Backup ist leer." >&2
  exit 1
}

chmod 600 "$tmp"
mv "$tmp" "$OUTPUT"
trap - EXIT INT TERM

echo "TimescaleDB-Backup erstellt: $OUTPUT"
