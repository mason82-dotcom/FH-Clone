#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f package-lock.json ]; then
  echo "FEHLER: package-lock.json fehlt. V3 verlangt reproduzierbares npm ci."
  exit 1
fi

if [ ! -f .env ]; then
  echo "FEHLER: .env fehlt. Zuerst: cp .env.example .env"
  exit 1
fi

if grep -Eq '=(change-me|change-me-)' .env; then
  echo "FEHLER: .env enthält noch change-me Platzhalter."
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "FEHLER: docker fehlt."
  exit 1
}

command -v curl >/dev/null 2>&1 || {
  echo "FEHLER: curl fehlt."
  exit 1
}

set -a
. ./.env
set +a

API_PORT="${FH2_API_PORT:-8080}"
WEB_PORT="${FH2_WEB_PORT:-8088}"

echo "[1/13] Compose validieren"
docker compose --env-file .env config >/dev/null

compose_services="$(docker compose --env-file .env config --services)"
for required_service in control-api emqx web timescaledb; do
  if ! printf '%s\n' "$compose_services" | grep -qx "$required_service"; then
    echo "FEHLER: Pflichtdienst fehlt im Root-Compose: $required_service"
    exit 1
  fi
done

echo "[2/13] Images bauen"
docker compose --env-file .env build

echo "[3/13] Stack starten"
docker compose --env-file .env up -d

wait_http() {
  url="$1"
  name="$2"
  attempts=60
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "FEHLER: $name nicht bereit: $url"
  docker compose --env-file .env ps
  return 1
}

echo "[4/13] Control API Health/Readiness"
wait_http "http://127.0.0.1:$API_PORT/health" "Control API Health"
wait_http "http://127.0.0.1:$API_PORT/ready" "Control API Readiness"

echo "       FH2 OpenAPI Read-only Status prüfen"
fh2_status="$(curl -fsS "http://127.0.0.1:$API_PORT/api/fh2/status")"
if ! printf '%s' "$fh2_status" | grep -q '"readOnly":true'; then
  echo "FEHLER: FH2 OpenAPI Status meldet keinen read-only Betrieb: $fh2_status"
  exit 1
fi
if printf '%s' "$fh2_status" | grep -Eiq '"(userToken|token|password|secret)"'; then
  echo "FEHLER: FH2 OpenAPI Status enthält sensitive Felder."
  exit 1
fi

echo "[5/13] Interne Control API im Container prüfen"
internal_health="$(
  docker compose --env-file .env exec -T control-api \
    node -e "
      fetch('http://127.0.0.1:8081/health')
        .then(async r => {
          const body = await r.json();
          process.stdout.write(String(r.status) + ':' + String(body.status));
        })
        .catch(() => process.exit(2));
    "
)"
if [ "$internal_health" != "200:ok" ]; then
  echo "FEHLER: interne Control API ist nicht healthy: $internal_health"
  exit 1
fi

echo "[6/13] EMQX Health prüfen"
if ! docker compose --env-file .env exec -T emqx \
  /opt/emqx/bin/emqx ctl status >/dev/null
then
  echo "FEHLER: EMQX meldet keinen gesunden Status."
  exit 1
fi

echo "[7/13] TimescaleDB Health prüfen"
if ! docker compose --env-file .env exec -T timescaledb \
  pg_isready -U fhclone -d fhclone >/dev/null
then
  echo "FEHLER: TimescaleDB ist nicht bereit."
  exit 1
fi

echo "[8/13] Web prüfen"
wait_http "http://127.0.0.1:$WEB_PORT/health" "Web/Proxy"

echo "[9/13] Interne API darf nicht veröffentlicht sein"
control_api_container="$(docker compose --env-file .env ps -q control-api)"
if [ -z "$control_api_container" ]; then
  echo "FEHLER: Control-API-Container für Portprüfung nicht gefunden."
  exit 1
fi
port_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$control_api_container")"
if printf '%s' "$port_bindings" | grep -Eq '"8081/tcp"[[:space:]]*:[[:space:]]*\['; then
  echo "FEHLER: interner Control-API-Port 8081 ist als Host-Port veröffentlicht."
  exit 1
fi

echo "[10/13] AuthN Fail-Closed lokal prüfen"
authn_result="$(
  docker compose --env-file .env exec -T control-api     node -e "
      fetch('http://127.0.0.1:8081/internal/emqx/authn', {
        method: 'POST',
        headers: {'content-type':'application/json','authorization':'Bearer invalid'},
        body: JSON.stringify({
          username:'dji-gateway-invalid',
          password:'invalid',
          clientid:'verify'
        })
      }).then(async r => {
        const b = await r.json();
        process.stdout.write(String(r.status) + ':' + String(b.result));
      }).catch(() => process.exit(2));
    "
)"
if [ "$authn_result" != "200:deny" ]; then
  echo "FEHLER: AuthN ist nicht fail-closed: $authn_result"
  exit 1
fi

echo "[11/13] AuthN/AuthZ Credential-Bindung und Revocation prüfen"
verify_gateway="VERIFY-GW-$(date +%s)"
verify_user="dji-gateway-verify-$(date +%s)"
verify_password="Verify-Only-$verify_gateway-A9!"
verify_credential_created=0
verify_id=""
verify_marker_created=0

cleanup_verify_credential() {
  if [ "$verify_credential_created" -ne 1 ]; then
    return 0
  fi

  if docker compose --env-file .env exec -T timescaledb \
    psql -U fhclone -d fhclone -v ON_ERROR_STOP=1 \
    -c "DELETE FROM gateway_credentials WHERE username = '$verify_user';" >/dev/null
  then
    verify_credential_created=0
    return 0
  fi

  echo "WARNUNG: temporäres Verify-Credential konnte nicht entfernt werden: $verify_user" >&2
  return 1
}

cleanup_verify_marker() {
  if [ "$verify_marker_created" -ne 1 ] || [ -z "$verify_id" ]; then
    return 0
  fi

  if docker compose --env-file .env exec -T timescaledb \
    psql -U fhclone -d fhclone -v ON_ERROR_STOP=1 \
    -c "DELETE FROM fh2_runtime_verify WHERE id = '$verify_id';" >/dev/null
  then
    verify_marker_created=0
    return 0
  fi

  echo "WARNUNG: temporärer Persistenzmarker konnte nicht entfernt werden: $verify_id" >&2
  return 1
}

cleanup_verify_artifacts() {
  cleanup_failed=0

  if ! cleanup_verify_credential; then
    cleanup_failed=1
  fi

  if ! cleanup_verify_marker; then
    cleanup_failed=1
  fi

  return "$cleanup_failed"
}

finish_verify() {
  original_status=$?
  final_status=$original_status

  trap - 0 INT TERM

  if ! cleanup_verify_artifacts; then
    echo "FEHLER: Verify-Cleanup konnte nicht vollständig abgeschlossen werden." >&2
    if [ "$final_status" -eq 0 ]; then
      final_status=1
    fi
  fi

  exit "$final_status"
}

trap 'finish_verify' 0
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose --env-file .env exec -T \
  -e VERIFY_GATEWAY="$verify_gateway" \
  -e VERIFY_USER="$verify_user" \
  -e VERIFY_PASSWORD="$verify_password" \
  control-api \
  node --input-type=module -e '
    import { randomUUID } from "node:crypto";
    import { Pool } from "pg";
    import { hashGatewayPassword } from "./apps/control-api/dist/authn.js";

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const hash = await hashGatewayPassword(process.env.VERIFY_PASSWORD);
      await pool.query(
        `INSERT INTO gateway_credentials (
           principal_id, username, password_hash, gateway_sn, enabled
         ) VALUES ($1, $2, $3, $4, TRUE)`,
        [
          randomUUID(),
          process.env.VERIFY_USER,
          hash,
          process.env.VERIFY_GATEWAY
        ]
      );
    } finally {
      await pool.end();
    }
  '
verify_credential_created=1

authn_allow="$(
  docker compose --env-file .env exec -T \
    -e VERIFY_GATEWAY="$verify_gateway" \
    -e VERIFY_USER="$verify_user" \
    -e VERIFY_PASSWORD="$verify_password" \
    control-api \
    node --input-type=module -e '
      const response = await fetch("http://127.0.0.1:8081/internal/emqx/authn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + process.env.EMQX_AUTHN_TOKEN
        },
        body: JSON.stringify({
          username: process.env.VERIFY_USER,
          password: process.env.VERIFY_PASSWORD,
          clientid: "verify-session"
        })
      });
      const body = await response.json();
      process.stdout.write(
        String(response.status) + ":" +
        String(body.result) + ":" +
        String(body.client_attrs?.gateway_sn ?? "")
      );
    '
)"
if [ "$authn_allow" != "200:allow:$verify_gateway" ]; then
  echo "FEHLER: AuthN Credential-Bindung unerwartet: $authn_allow"
  exit 1
fi

authz_allow="$(
  docker compose --env-file .env exec -T \
    -e VERIFY_GATEWAY="$verify_gateway" \
    -e VERIFY_USER="$verify_user" \
    control-api \
    node --input-type=module -e '
      const response = await fetch("http://127.0.0.1:8081/internal/emqx/authz", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + process.env.EMQX_AUTHZ_TOKEN
        },
        body: JSON.stringify({
          username: process.env.VERIFY_USER,
          clientid: "arbitrary-session-id",
          role: "dji_gateway",
          gateway_sn: process.env.VERIFY_GATEWAY,
          action: "publish",
          topic: "sys/product/" + process.env.VERIFY_GATEWAY + "/status",
          qos: 0
        })
      });
      const body = await response.json();
      process.stdout.write(String(response.status) + ":" + String(body.result));
    '
)"
if [ "$authz_allow" != "200:allow" ]; then
  echo "FEHLER: AuthZ trusted gateway_sn unerwartet: $authz_allow"
  exit 1
fi

docker compose --env-file .env exec -T \
  -e VERIFY_USER="$verify_user" \
  control-api \
  node --input-type=module -e '
    import { Pool } from "pg";
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await pool.query(
        "UPDATE gateway_credentials SET enabled = FALSE WHERE username = $1",
        [process.env.VERIFY_USER]
      );
    } finally {
      await pool.end();
    }
  '

authz_revoked="$(
  docker compose --env-file .env exec -T \
    -e VERIFY_GATEWAY="$verify_gateway" \
    -e VERIFY_USER="$verify_user" \
    control-api \
    node --input-type=module -e '
      const response = await fetch("http://127.0.0.1:8081/internal/emqx/authz", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + process.env.EMQX_AUTHZ_TOKEN
        },
        body: JSON.stringify({
          username: process.env.VERIFY_USER,
          clientid: "arbitrary-session-id",
          role: "dji_gateway",
          gateway_sn: process.env.VERIFY_GATEWAY,
          action: "publish",
          topic: "sys/product/" + process.env.VERIFY_GATEWAY + "/status",
          qos: 0
        })
      });
      const body = await response.json();
      process.stdout.write(String(response.status) + ":" + String(body.result));
    '
)"
if [ "$authz_revoked" != "200:deny" ]; then
  echo "FEHLER: deaktiviertes Credential behält AuthZ-Rechte: $authz_revoked"
  exit 1
fi

if ! cleanup_verify_credential; then
  echo "FEHLER: temporäres Verify-Credential blieb in der Datenbank: $verify_user" >&2
  exit 1
fi

echo "[12/13] Statische ACL darf keine permanenten DRC-Rechte enthalten"
if grep -Eq 'drc/(up|down)' infra/emqx/acl.conf; then
  echo "FEHLER: statische Basic-Link-ACL enthält DRC-Rechte."
  exit 1
fi

echo "[13/13] Persistenz-Restart prüfen"
verify_id="fh2-verify-$(date +%s)"
docker compose --env-file .env exec -T timescaledb \
  psql -U fhclone -d fhclone -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE IF NOT EXISTS fh2_runtime_verify (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" \
  -c "INSERT INTO fh2_runtime_verify (id) VALUES ('$verify_id');" >/dev/null
verify_marker_created=1

docker compose --env-file .env restart timescaledb >/dev/null
wait_http "http://127.0.0.1:$API_PORT/ready" "Readiness nach DB-Restart"

persisted="$(
  docker compose --env-file .env exec -T timescaledb \
    psql -U fhclone -d fhclone -tAc \
    "SELECT count(*) FROM fh2_runtime_verify WHERE id = '$verify_id';"
)"
if [ "$(printf '%s' "$persisted" | tr -d '[:space:]')" != "1" ]; then
  echo "FEHLER: Persistenzmarker fehlt nach TimescaleDB-Restart."
  exit 1
fi

if ! cleanup_verify_marker; then
  echo "FEHLER: temporärer Persistenzmarker blieb in der Datenbank: $verify_id" >&2
  exit 1
fi

echo "FH2 V3 lokale Runtime-Prüfung erfolgreich."
echo "Stack bleibt gestartet."
