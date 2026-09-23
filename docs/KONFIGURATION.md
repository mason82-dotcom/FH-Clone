# Konfiguration

## Zweck

Dieses Dokument beschreibt die aktuell im Code verwendeten
Umgebungsvariablen und trennt sie von noch nicht implementierten V3-Zielen.

Secrets gehören ausschließlich in lokale Laufzeitkonfiguration oder einen
Secret-Store. Sie dürfen nicht in Git committed werden.

## Control API

### Öffentliche HTTP-Schnittstelle

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BIND` | `0.0.0.0` | Bind-Adresse der öffentlichen API |
| `PORT` | `8080` | Port der öffentlichen API |

### Interne Infrastruktur-API

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `INTERNAL_BIND` | `0.0.0.0` | Bind-Adresse der internen API |
| `INTERNAL_PORT` | `8081` | interner Port für EMQX und Infrastruktur |

Der interne Port darf nicht über einen öffentlichen Reverse Proxy erreichbar
sein.

## DJI MQTT

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `DJI_MQTT_URL` | leer | Broker-URL; ohne Wert startet der DJI-Adapter nicht |
| `DJI_MQTT_USERNAME` | leer | MQTT-Benutzername |
| `DJI_MQTT_PASSWORD` | leer | MQTT-Passwort |
| `DJI_MQTT_CLIENT_ID` | `fh-clone-backend` | Client-ID des FH2-Backend-Adapters |
| `DJI_CLOUD_API_VERSION` | Adapter-Baseline | Kompatibilitätsprofil der DJI Cloud API |

Wichtig: `DJI_MQTT_CLIENT_ID` ist die Client-ID des **Backend-Adapters**.
Sie ist nicht mit der realen Client-ID einer DJI RC Pro gleichzusetzen.

## EMQX-Authorizer

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `EMQX_AUTHN_TOKEN` | leer | internes Bearer-Secret für EMQX-AuthN-Anfragen |
| `EMQX_AUTHZ_TOKEN` | leer | internes Bearer-Secret für dynamische AuthZ-Anfragen |

Ist `EMQX_AUTHZ_TOKEN` nicht gesetzt, bleiben dynamische DJI-/DRC-Rechte
gesperrt.

Das ist beabsichtigtes Fail-Closed-Verhalten.

## TimescaleDB und Missionspersistenz

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TIMESCALE_URL` | leer | PostgreSQL-/TimescaleDB-Verbindungszeichenfolge; aktiviert den MissionStore |
| `RTK_SOURCE_LABEL` | leer | nicht-sensitive Bezeichnung der RTK-Korrekturquelle |
| `RTK_SOURCE_PROVIDER` | leer | nicht-sensitiver Anbietername der RTK-Korrekturquelle |

Für den eigenständigen TimescaleDB-Unterstack:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TIMESCALE_PASSWORD` | `change-me` in der Vorlage | Datenbankpasswort; vor dem Start zwingend ändern |

Der aktuelle Unterstack verwendet intern:

```text
Datenbank: fhclone
Benutzer:  fhclone
Port:      5432 nur intern exponiert
Image:     timescale/timescaledb:2.30.1-pg16
```

`RTK_SOURCE_LABEL` und `RTK_SOURCE_PROVIDER` enthalten keine NTRIP-Secrets.

## FlightHub 2 OpenAPI V2

Der FH2-Pfad ist ausschließlich lesend.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `FH2_ENABLED` | `false` | aktiviert den read-only FH2-OpenAPI-Client |
| `FH2_BASE_URL` | leer | Basis-URL der FlightHub-2-OpenAPI |
| `FH2_ORG_ID` | leer | Organization-ID für Geräteabfragen |
| `FH2_PROJECT_ID` | leer | Workspace-/Projekt-ID für Waylines und Flight Tasks |
| `FH2_USER_TOKEN` | leer | `X-User-Token`; Secret |
| `FH2_TIMEOUT_MS` | `15000` | Request-Timeout in Millisekunden |

Der Client sendet zusätzlich `X-Request-Id`, `X-Language: en` und bei
Projektaufrufen `X-Project-Uuid`.

Es werden nur GET-Anfragen ausgeführt; HTTP-Redirects werden nicht verfolgt.

## Diagnose

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `LOG_RAW_DJI` | nicht gesetzt | bei `1`: DJI-Rohmeldungen diagnostisch ausgeben |

Rohmeldungen können sensible Betriebsdaten enthalten. Die Option ist nur für
kontrollierte Diagnose gedacht.

## Weboberfläche

Der Vite-Entwicklungsserver verwendet aktuell:

```text
Host: 0.0.0.0
Port: 5173
```

Im Entwicklungsmodus werden folgende Pfade an die lokale Control API
weitergereicht:

```text
/api     -> http://127.0.0.1:8080
/health  -> http://127.0.0.1:8080
```

### FlightHub 2 Frontend Standalone

Die offizielle DJI-On-Premises-Frontend-Runtime ist optional.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `VITE_FH2_STANDALONE_ENABLED` | `false` | lädt `paas.js` und aktiviert die offiziellen Standalone-Komponenten |
| `VITE_FH2_NATIVE_COCKPIT_ENABLED` | `false` | erlaubt das native DJI Virtual Cockpit |
| `VITE_FH2_HOST_URL` | leer | Host, von dem DJI-Frontend-Ressourcen geladen werden |
| `VITE_FH2_SERVER_URL` | leer | HTTP-Backend-URL des On-Premises-Systems |
| `VITE_FH2_WSS_URL` | leer | Duplex-WebSocket-URL des On-Premises-Systems |
| `VITE_FH2_PROJECT_ID` | leer | `prjId` für `window.FH2.initConfig()` |
| `VITE_FH2_PROJECT_TOKEN` | leer | browserseitiger `projectToken` für `paas.js` |
| `VITE_FH2_PAAS_URL` | `<HOST>/paas.js` | optionaler expliziter Pfad zur DJI-Runtime |
| `VITE_FH2_COCKPIT_PROP_STYLE` | `camel` | `camel` für aktuelle API, `snake` für v1.5-Demo-Kompatibilität |
| `VITE_FH2_GATEWAY_SN` | leer | optionale Standard-Gateway-SN |
| `VITE_FH2_DRONE_SN` | leer | optionale Standard-Aircraft-SN |
| `VITE_FH2_WAYLINE_ID` | leer | optionale Standard-Wayline-ID |
| `VITE_FH2_FLIGHT_PATH_ID` | leer | optionale Standard-Flight-Path-ID |

`VITE_*` wird von Vite beim **Build** in das Browser-Bundle übernommen.
Änderungen erfordern deshalb einen Neubau des Web-Images.

`VITE_FH2_PROJECT_TOKEN` ist für die DJI-Browser-Runtime sichtbar. Er darf
nicht mit dem serverseitigen `FH2_USER_TOKEN` der OpenAPI-Integration
verwechselt oder wiederverwendet werden.

Details: [FH2_STANDALONE_FRONTEND.md](FH2_STANDALONE_FRONTEND.md).

## Self-Hosted Livestreaming

Verbindlicher Zielpfad:

```text
DJI Pilot 2 -> RTMP -> MediaMTX -> WebRTC -> FH2 WebUI
```

Der FlightHub-2-/SIKONG-CE-Bezahlstream bleibt deaktiviert.

Die konkrete MediaMTX-Laufzeitkonfiguration ist noch nicht auf `main`
implementiert. Vorgesehene Konfigurationsdomänen sind:

```text
LIVESTREAM_ENABLED
MEDIAMTX_HOST
MEDIAMTX_RTMP_PORT
MEDIAMTX_WEBRTC_PORT
MEDIAMTX_HLS_PORT
LIVESTREAM_PUBLIC_WEBRTC_URL
LIVESTREAM_PUBLIC_HLS_URL
```

Diese Namen sind bis zur tatsächlichen Compose-/Runtime-Implementierung
**Zielkonfiguration**, keine bereits auswertbaren Environment-Variablen.

RTMP-Publish-Keys, DJI-Credentials und sonstige Secrets dürfen nie über
`VITE_*` in das Browser-Bundle gelangen.

Details: [LIVESTREAM.md](LIVESTREAM.md).

## UgCS-UCS-Bridge

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `UGCS_HOST` | `localhost` | Host des UgCS Universal Control Server |
| `UGCS_PORT` | `3334` | UCS-Port |
| `UGCS_USER` | leer | UgCS-Benutzer |
| `UGCS_PASSWORD` | leer | UgCS-Passwort |
| `BRIDGE_BIND` | `0.0.0.0` | Bind-Adresse der HTTP-Bridge |
| `BRIDGE_PORT` | `8092` | Port der HTTP-Bridge |
| `UGCS_BRIDGE_URL` | leer | serverseitige URL der HTTP-Bridge für die Control API |
| `UGCS_BRIDGE_TIMEOUT_MS` | `5000` | Timeout des read-only Bridge-Clients |

Die Root-Compose enthält `ugcs-bridge` als optionales Profil:

```bash
docker compose --profile ugcs up -d
```

Für den In-Compose-Pfad wird typischerweise
`UGCS_BRIDGE_URL=http://ugcs-bridge:8092` gesetzt.

## Native Android-/MSDK-Bridge

Die native FH2 RC Bridge für DJI MSDK V5 ist optional und standardmäßig
deaktiviert.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MSDK_PAIRING_TOKEN` | leer | Bootstrap-Secret für `POST /api/msdk/pair` |
| `MSDK_BRIDGE_TOKEN_SECRET` | leer | HMAC-Secret für signierte Agent-Tokens |
| `MSDK_BRIDGE_TOKEN_TTL_SECONDS` | `86400` | Lebensdauer eines gepairten Agent-Tokens |

Nur wenn `MSDK_PAIRING_TOKEN` und `MSDK_BRIDGE_TOKEN_SECRET` gesetzt sind,
ist Pairing aktiv. Der Heartbeat-Kanal ist read-only und besitzt keine
Flight-Control-Kommandos.

Der Bootstrap-Token wird von der Android-App nur zur Pairing-Anfrage
verwendet. Das daraus erzeugte Agent-Token ist an `gatewaySn + aircraftSn`
gebunden. Explizites Unpair schreibt ausschließlich den SHA-256-Digest des
Agent-Tokens mit seiner Ablaufzeit nach `msdk_token_revocations`. Dadurch
bleibt der Widerruf über Control-API-Neustarts erhalten, ohne eine zweite
Gateway-/Aircraft-Identity oder Runtime-Control-Rechte zu persistieren.

## Media-Ingest

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MEDIA_INGEST_TOKEN` | leer | internes Bearer-Secret für `POST /internal/media/assets`; ohne Wert ist der Ingest gesperrt |

Der Ingest akzeptiert ausschließlich `MediaAsset`-Domainobjekte. Die
browserseitige Kartenansicht liest nur `GET /api/media/overlays`.

## Root-Compose-Konfiguration

Die Vorlage `.env.example` enthält zusätzlich:

| Variable | Standard/Vorlage | Bedeutung |
| --- | --- | --- |
| `FH2_API_BIND` | `0.0.0.0` | Host-Bind für die öffentliche API |
| `FH2_API_PORT` | `8080` | veröffentlichter API-Port |
| `FH2_WEB_BIND` | `0.0.0.0` | Host-Bind der Weboberfläche |
| `FH2_WEB_PORT` | `8088` | veröffentlichter Web-Port |
| `MQTT_BIND` | `0.0.0.0` | Host-Bind des MQTT-Listeners |
| `MQTT_PORT` | `1883` | veröffentlichter MQTT-Port |
| `EMQX_IMAGE` | `emqx/emqx:5.7.2` | verbindliches EMQX-5.7-Laufzeitprofil |
| `TIMESCALE_PASSWORD` | `change-me-...` | DB-Secret |
| `MQTT_BACKEND_PASSWORD` | `change-me-...` | MQTT-Secret des Backend-Service |
| `EMQX_AUTHN_TOKEN` | `change-me-...` | interner AuthN-Hook-Token |
| `EMQX_AUTHZ_TOKEN` | `change-me-...` | interner AuthZ-Hook-Token |
| `MSDK_PAIRING_TOKEN` | leer | optionales Android-Pairing-Secret |
| `MSDK_BRIDGE_TOKEN_SECRET` | leer | optionales HMAC-Secret für Agent-Tokens |
| `MSDK_BRIDGE_TOKEN_TTL_SECONDS` | `86400` | Agent-Token-Lebensdauer |

`scripts/verify.sh` verweigert die Abnahme, solange `change-me`-Platzhalter
in `.env` stehen.

Der Root-Compose setzt intern:

```text
DATABASE_URL
TIMESCALE_URL
DJI_MQTT_URL=mqtt://emqx:1883
DJI_MQTT_USERNAME=backend-service
DJI_MQTT_CLIENT_ID=fh-clone-backend
```

Die Gateway-Credentials selbst liegen nicht in `.env`, sondern in
`gateway_credentials` und enthalten nur Passwort-Hashes.

## Noch nicht finalisierte V3-Konfiguration

Noch nicht als allgemeiner Vertrag finalisiert sind:

- Media-Storage
- Multispektral-/Processing-Konfiguration
- ein möglicher Shared Store für Mehrinstanz-DRC

Aktive DRC-Sessions dürfen auch bei einem späteren Shared Store niemals aus
historischer Persistenz als Autorisierungszustand rehydriert werden.

## Secret-Regeln

Nicht in Git:

- MQTT-Passwörter
- EMQX-Interntoken
- UgCS-Zugangsdaten
- DJI-Tokens
- DRC-Relay-Credentials
- NTRIP-Zugangsdaten
- Datenbankpasswörter

Beispiele in Dokumenten verwenden ausschließlich Platzhalter.
