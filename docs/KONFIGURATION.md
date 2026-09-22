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

## UgCS-UCS-Bridge

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `UGCS_HOST` | `localhost` | Host des UgCS Universal Control Server |
| `UGCS_PORT` | `3334` | UCS-Port |
| `UGCS_USER` | leer | UgCS-Benutzer |
| `UGCS_PASSWORD` | leer | UgCS-Passwort |
| `BRIDGE_BIND` | `0.0.0.0` | Bind-Adresse der HTTP-Bridge |
| `BRIDGE_PORT` | `8092` | Port der HTTP-Bridge |

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
