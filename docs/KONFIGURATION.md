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
| `EMQX_AUTHZ_TOKEN` | leer | internes Bearer-Secret für dynamische AuthZ-Anfragen |

Ist `EMQX_AUTHZ_TOKEN` nicht gesetzt, bleiben dynamische DJI-/DRC-Rechte
gesperrt.

Das ist beabsichtigtes Fail-Closed-Verhalten.

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

## Noch nicht finalisierte V3-Konfiguration

Für folgende Bereiche sind die endgültigen Variablennamen noch **nicht**
verbindlich festgelegt und dürfen daher nicht vorab erfunden werden:

- PostgreSQL-Verbindungsdaten des finalen Root-Compose
- Gateway-Credential-Store
- EMQX HTTP AuthN
- Audit-Persistenz
- Redis/Shared Store für DRC-Sitzungen, falls für Mehrinstanzbetrieb nötig
- Media-Storage
- Multispektral-/Processing-Konfiguration

Diese Konfiguration wird erst dokumentiert, wenn die jeweilige
V3-Implementierung auf `main` vorhanden ist.

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
