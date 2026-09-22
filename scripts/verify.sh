#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

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

echo "[1/8] Compose validieren"
docker compose --env-file .env config >/dev/null

echo "[2/8] Images bauen"
docker compose --env-file .env build

echo "[3/8] Stack starten"
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

echo "[4/8] Control API Health/Readiness"
wait_http "http://127.0.0.1:$API_PORT/health" "Control API Health"
wait_http "http://127.0.0.1:$API_PORT/ready" "Control API Readiness"

echo "[5/8] Web prüfen"
wait_http "http://127.0.0.1:$WEB_PORT/health" "Web/Proxy"

echo "[6/8] Interne API darf nicht veröffentlicht sein"
if docker compose --env-file .env port control-api 8081 2>/dev/null | grep -q .; then
  echo "FEHLER: interner Control-API-Port 8081 ist als Host-Port veröffentlicht."
  exit 1
fi

echo "[7/8] AuthN Fail-Closed lokal prüfen"
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

echo "[8/8] Persistenz-Restart prüfen"
verify_id="fh2-verify-$(date +%s)"
docker compose --env-file .env exec -T timescaledb \
  psql -U fhclone -d fhclone -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE IF NOT EXISTS fh2_runtime_verify (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" \
  -c "INSERT INTO fh2_runtime_verify (id) VALUES ('$verify_id');" >/dev/null

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

docker compose --env-file .env exec -T timescaledb \
  psql -U fhclone -d fhclone -v ON_ERROR_STOP=1 \
  -c "DELETE FROM fh2_runtime_verify WHERE id = '$verify_id';" >/dev/null

echo "FH2 V3 lokale Runtime-Prüfung erfolgreich."
echo "Stack bleibt gestartet."
