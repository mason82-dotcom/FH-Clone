#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ "$#" -ne 2 ]; then
  echo "Verwendung: $0 <mqtt-username> <gateway_sn>"
  echo "Beispiel: $0 dji-gateway-rcpro1 RC-PRO-001"
  exit 2
fi

username="$1"
gateway_sn="$2"

if [[ ! "$username" =~ ^dji-gateway-[A-Za-z0-9_-]+$ ]]; then
  echo "FEHLER: Username muss mit dji-gateway- beginnen und darf nur sichere Zeichen enthalten."
  exit 1
fi

if [[ ! "$gateway_sn" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "FEHLER: gateway_sn enthält ungültige Zeichen."
  exit 1
fi

if [ ! -f .env ]; then
  echo "FEHLER: .env fehlt. Zuerst: cp .env.example .env"
  exit 1
fi

read -r -s -p "Neues MQTT-Passwort für $username: " gateway_password
printf '\n'

if [ "${#gateway_password}" -lt 16 ]; then
  echo "FEHLER: Passwort muss mindestens 16 Zeichen lang sein."
  exit 1
fi

export GATEWAY_USERNAME="$username"
export GATEWAY_SN="$gateway_sn"
export GATEWAY_PASSWORD="$gateway_password"

docker compose --env-file .env exec -T \
  -e GATEWAY_USERNAME \
  -e GATEWAY_SN \
  -e GATEWAY_PASSWORD \
  control-api \
  node --input-type=module -e '
    import { randomUUID } from "node:crypto";
    import { Pool } from "pg";
    import { hashGatewayPassword } from "./apps/control-api/dist/authn.js";

    const username = process.env.GATEWAY_USERNAME;
    const gatewaySn = process.env.GATEWAY_SN;
    const password = process.env.GATEWAY_PASSWORD;
    const connectionString = process.env.DATABASE_URL;

    if (!username || !gatewaySn || !password || !connectionString) {
      throw new Error("Provisioning-Umgebung unvollständig");
    }

    const passwordHash = await hashGatewayPassword(password);
    const pool = new Pool({ connectionString, max: 1 });

    try {
      await pool.query(
        `INSERT INTO gateway_credentials (
           principal_id,
           username,
           password_hash,
           gateway_sn,
           enabled,
           created_at,
           rotated_at
         ) VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           gateway_sn = EXCLUDED.gateway_sn,
           enabled = TRUE,
           rotated_at = NOW()`,
        [randomUUID(), username, passwordHash, gatewaySn]
      );
    } finally {
      await pool.end();
    }
  '

unset GATEWAY_PASSWORD gateway_password

echo "Gateway-Credential provisioniert/rotiert:"
echo "  username:   $username"
echo "  gateway_sn: $gateway_sn"
echo "Passwort wurde nicht ausgegeben oder im Klartext persistiert."
