#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$(mktemp)"
PROJECT="${FH2_MAPPING_E2E_PROJECT:-fh2-mapping-e2e}"
COMPOSE_FILES="-f compose.yaml -f services/mapping-compute-agent/docker-compose.e2e.yml"

set_env() {
  key="$1"
  value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

cp .env.example "$ENV_FILE"

set_env TIMESCALE_PASSWORD "e2e-timescale-password-A7"
set_env MQTT_BACKEND_PASSWORD "e2e-mqtt-backend-password-A7"
set_env EMQX_NODE_COOKIE "e2e-emqx-cookie-A7-safe"
set_env EMQX_AUTHN_TOKEN "e2e-authn-token-A7-safe"
set_env EMQX_AUTHZ_TOKEN "e2e-authz-token-A7-safe"
set_env MEDIA_INGEST_TOKEN "e2e-media-ingest-token-A7"
set_env MAPPING_OPERATOR_TOKEN "e2e-mapping-operator-token-A7"
set_env MAPPING_AGENT_TOKEN "e2e-mapping-agent-token-A7"
set_env MAPPING_LAYER_VIEW_ENABLED "true"
set_env MAPPING_DEFAULT_LEASE_SECONDS "120"
set_env MAPPING_MAX_LEASE_ATTEMPTS "2"
set_env MAPPING_S3_INTERNAL_ENDPOINT "http://mapping-minio:9000"
set_env MAPPING_S3_PUBLIC_ENDPOINT "http://mapping-minio:9000"
set_env MAPPING_S3_ACCESS_KEY "e2e-mapping-user"
set_env MAPPING_S3_SECRET_KEY "e2e-mapping-secret-A7-safe"
set_env MAPPING_S3_REGION "us-east-1"
set_env MAPPING_MEDIA_BUCKET "fh2-media-e2e"
set_env MAPPING_RESULTS_BUCKET "fh2-mapping-results-e2e"
set_env MAPPING_PRESIGN_TTL_SECONDS "300"
set_env MAPPING_MINIO_ROOT_USER "e2e-minio-root"
set_env MAPPING_MINIO_ROOT_PASSWORD "e2e-minio-root-password-A7"
set_env MAPPING_S3_BIND "127.0.0.1"
set_env MAPPING_S3_PORT "19000"
set_env MAPPING_MINIO_CONSOLE_BIND "127.0.0.1"
set_env MAPPING_MINIO_CONSOLE_PORT "19001"
set_env FH2_API_BIND "127.0.0.1"
set_env FH2_API_PORT "18080"
set_env MQTT_BIND "127.0.0.1"
set_env MQTT_PORT "18885"
set_env NODEODM_TOKEN "e2e-nodeodm-token"

dc() {
  docker compose -p "$PROJECT" $COMPOSE_FILES --env-file "$ENV_FILE"     --profile mapping --profile mapping-e2e "$@"
}

cleanup() {
  status="$?"
  if [ "$status" -ne 0 ]; then
    echo "Mapping E2E failed; relevant logs follow." >&2
    dc logs --no-color       control-api mapping-minio mapping-minio-init       mapping-fake-nodeodm mapping-e2e-agent timescaledb 2>/dev/null || true
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

# A stale local run must never influence this validation.
dc down -v --remove-orphans >/dev/null 2>&1 || true

# Validate the merged root + E2E compose model before building anything.
dc config >/dev/null

dc up -d --build   mapping-minio   mapping-minio-init   mapping-fake-nodeodm   mapping-e2e-agent

ready=0
for attempt in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:18080/ready" >/tmp/fh2-mapping-e2e-ready.json 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Control API did not become ready for Mapping E2E." >&2
  curl -sS "http://127.0.0.1:18080/ready" >&2 || true
  echo >&2
  exit 1
fi

grep -F '"status":"ready"' /tmp/fh2-mapping-e2e-ready.json >/dev/null

dc run --rm --no-deps mapping-e2e-driver

job_status="$(dc exec -T timescaledb   psql -U fhclone -d fhclone -tAc   "SELECT status FROM mapping_jobs ORDER BY created_at DESC LIMIT 1;"   | tr -d '[:space:]')"
[ "$job_status" = "DONE" ] || {
  echo "Expected latest mapping job DONE, got '$job_status'." >&2
  exit 1
}

media_count="$(dc exec -T timescaledb   psql -U fhclone -d fhclone -tAc   "SELECT count(*) FROM media_assets WHERE asset_id = 'mapping-e2e-source-v1';"   | tr -d '[:space:]')"
[ "$media_count" = "1" ] || {
  echo "Expected one persisted E2E MediaAsset, got '$media_count'." >&2
  exit 1
}

result_count="$(dc exec -T timescaledb   psql -U fhclone -d fhclone -tAc   "SELECT count(*) FROM mapping_results;"   | tr -d '[:space:]')"
[ "$result_count" -ge 3 ] || {
  echo "Expected at least 3 mapping results, got '$result_count'." >&2
  exit 1
}

layer_count="$(dc exec -T timescaledb   psql -U fhclone -d fhclone -tAc   "SELECT count(*) FROM mapping_layers WHERE layer_type = 'xyz';"   | tr -d '[:space:]')"
[ "$layer_count" = "1" ] || {
  echo "Expected exactly one XYZ mapping layer, got '$layer_count'." >&2
  exit 1
}

echo "MAPPING_E2E=PASS media_assets=$media_count mapping_results=$result_count mapping_layers=$layer_count"
