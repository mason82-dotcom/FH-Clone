# FH2-Control-API

## Aufgabe

Die Control API ist der zentrale Backend-Prozess von FH-Clone.

Sie verbindet:

- DJI-Cloud-MQTT-Ingest
- Geräte- und Parameter-Registry
- Gateway-/Sub-Device-Topologie
- automatische Flugsitzungen
- RTK-/GNSS-Auswertung
- optionale Missionspersistenz
- öffentliche Lese-API
- interne EMQX-Autorisierung

Schreibende Flugsteuerung wird nicht direkt über öffentliche HTTP-Endpunkte
angeboten.

## Ports

| Port | Zweck | Veröffentlichung |
| --- | --- | --- |
| `8080` | öffentliche FH2-API | lokal/LAN nach Deployment-Regeln |
| `8081` | interne Infrastruktur-API | **nicht öffentlich veröffentlichen** |

Konfigurierbar über:

- `BIND`
- `PORT`
- `INTERNAL_BIND`
- `INTERNAL_PORT`

## Startverhalten

Wenn `DJI_MQTT_URL` gesetzt ist, startet der DJI-Cloud-Adapter und verbindet
sich mit dem konfigurierten MQTT-Broker.

Ohne `DJI_MQTT_URL` bleibt die HTTP-API lauffähig, der DJI-Adapter ist jedoch
deaktiviert.

Wenn `TIMESCALE_URL` gesetzt ist, aktiviert die Control API den
`MissionStore` für automatische Missionssitzungen.

## Umgebungsvariablen

### HTTP

- `BIND` – öffentliche Bind-Adresse, Standard `0.0.0.0`
- `PORT` – öffentlicher Port, Standard `8080`
- `INTERNAL_BIND` – interne Bind-Adresse, Standard `0.0.0.0`
- `INTERNAL_PORT` – interner Port, Standard `8081`

### DJI MQTT

- `DJI_MQTT_URL`
- `DJI_MQTT_USERNAME`
- `DJI_MQTT_PASSWORD`
- `DJI_MQTT_CLIENT_ID`
- `DJI_CLOUD_API_VERSION`

### FlightHub 2 OpenAPI

- `FH2_ENABLED`
- `FH2_BASE_URL`
- `FH2_ORG_ID`
- `FH2_PROJECT_ID`
- `FH2_USER_TOKEN`
- `FH2_TIMEOUT_MS`

Der FH2-Client ist read-only und folgt keinen HTTP-Redirects.

### EMQX und Diagnose

- `EMQX_AUTHZ_TOKEN` – internes Secret für EMQX -> Control API
- `LOG_RAW_DJI=1` – DJI-Rohmeldungen diagnostisch ausgeben

### TimescaleDB und RTK-Metadaten

- `TIMESCALE_URL` – aktiviert Missionspersistenz
- `RTK_SOURCE_LABEL` – optionale nicht-sensitive Bezeichnung der RTK-Quelle
- `RTK_SOURCE_PROVIDER` – optionaler nicht-sensitiver Anbietername

Secrets gehören ausschließlich in Runtime-Konfiguration.

## Öffentliche API

### Gesundheit

```http
GET /health
```

Liefert unter anderem:

- Dienststatus
- DJI-Adapter aktiviert/verbunden
- DJI-API-Kompatibilitätsprofil
- Anzahl aktiver Missionssitzungen
- Status der Missionspersistenz

### Geräte

```http
GET /api/devices
```

Liefert die aktuelle `DeviceRegistry`.

### DJI-Topologie

```http
GET /api/dji/topology
```

Liefert bekannte Gateway-/Sub-Device-Beziehungen.

### Telemetrie

```http
GET /api/devices/{device_sn}/telemetry
```

Liefert den aktuellen normalisierten Parametersnapshot.

### FlightHub 2 OpenAPI – read-only

```http
GET /api/fh2/status
GET /api/fh2/waylines?page=1&size=100
GET /api/fh2/flight-tasks?page=1&page_size=50
```

Der FH2-Pfad verwendet ausschließlich GET. Fehlende Konfiguration liefert
`503 fh2_not_configured`; Upstreamfehler werden als `502 fh2_upstream_error`
abgebildet.

Die Wayline-/Flight-Task-IDs aus diesem Pfad können später über den
`MissionExternalReference`-Vertrag mit lokalen Flugsitzungen korreliert
werden. Eine Korrelation entsteht nicht automatisch durch Zeitnähe.

### Automatische Flugsitzungen

```http
GET /api/missions/active
GET /api/devices/{device_sn}/mission
GET /api/devices/{device_sn}/wayline
```

Die Control API erkennt aus DJI-`mode_code`-Werten automatisch eine
Flugsitzung und vergibt eine `missionId`.

Eine Sitzung startet nur bei als flugaktiv eingestuften Modi. Details und
deutsche Modusbeschreibung:

- [Missionen](../../docs/MISSIONEN.md)

`GET /api/devices/{device_sn}/mission` liefert:

- aktuell aktive Sitzung
- zuletzt abgeschlossene Sitzung

Bei gesetztem `TIMESCALE_URL` werden Start und Ende automatisch in
TimescaleDB/PostgreSQL persistiert.

Beim Service-Neustart werden noch offene automatische DB-Sitzungen mit
`service_restart` abgeschlossen, bevor neuer DJI-Ingest beginnt.

### Capabilities

```http
GET /api/devices/{device_sn}/capabilities
```

Der Endpunkt trennt:

- tatsächlich gemeldete Adapter-Capabilities,
- DJI-Produktsupport und spezialisierte Control-Profile,
- Mission-/Wayline-Evidenz.

Produktunterstützung ist nicht automatisch eine ausführbare
`AircraftAdapter.execute()`-Capability.

### Wayline-Beobachtung

`GET /api/devices/{device_sn}/wayline` ist read-only. Der Endpunkt zeigt
Telemetrieevidenz aus `mode_code == 5`, aber keine erfundene Wayline-ID
und keine implizite `mission.wayline`-Freigabe.

### RTK/GNSS

```http
GET /api/rtk
GET /api/devices/{device_sn}/rtk
GET /api/rtk/transitions
GET /api/rtk/transitions?device={device_sn}
GET /api/events/rtk
GET /api/events/rtk?device={device_sn}
```

`/api/events/rtk` verwendet Server-Sent Events.

RTK-Snapshots können zusätzlich die aktuelle `missionId` tragen.

## RTK-Snapshot

Beispiel:

```json
{
  "deviceId": "AIRCRAFT_SN",
  "gatewaySn": "GATEWAY_SN",
  "fixState": "fixed",
  "fixStateCode": 2,
  "qualityCode": 10,
  "isFixed": true,
  "gpsSatellites": 18,
  "rtkSatellites": 26,
  "modeCode": 18,
  "airborneRtkFixingMode": true,
  "sampledAt": 1790040000000,
  "stale": false,
  "ageMs": 230
}
```

`stale` ist eine lokale Monitoringbewertung und keine
DJI-Protokollkonstante.

## RTK-Zustandswechsel

Echte Fix-Wechsel:

```text
false -> true  = acquired
true  -> false = lost
```

Die RTK-Verlaufshistorie ist aktuell In-Memory.

## Missionspersistenz

Aktivierung:

```env
TIMESCALE_URL=postgresql://fhclone:<passwort>@timescaledb:5432/fhclone
```

Optionale sichere RTK-Metadaten:

```env
RTK_SOURCE_LABEL=SAPOS BW
RTK_SOURCE_PROVIDER=Landesdienst
```

Ohne `TIMESCALE_URL` bleibt Live-Telemetrie, RTK und automatische
Missionssitzung funktionsfähig; nur die Datenbankpersistenz entfällt.

## Interne EMQX-API

Aktuell implementiert:

```http
POST /internal/emqx/authn
POST /internal/emqx/authz
```

Beide Endpunkte sind ausschließlich für EMQX im internen Servicenetz
vorgesehen. AuthN bindet Gateway-Credentials serverseitig an eine
vertrauenswürdige `gateway_sn`; AuthZ verwendet diese trusted Identity zusammen
mit der Runtime-Topologie.

## Topologie

`update_topo` auf:

```text
sys/product/{gateway_sn}/status
```

füllt die Gateway-Registry.

Beispiel:

```text
RC Pro Enterprise
  gateway_sn
     |
     +-- M3E/M3T/M3TA im aktuellen Pilot-to-Cloud-Produktprofil
         device_sn

M3M wird separat als MSDK/WPML-/Media-Fall behandelt.
```

Aircraft-`osd/state` wird nach `device_sn` verarbeitet. Gateway-Services
werden über `gateway_sn` geroutet.

## NTRIP-Grenze

Für M3E/M3T/M3M setzt oder speichert die Control API keine
NTRIP-Zugangsdaten.

Host, Port, Mountpoint, Benutzername und Passwort bleiben im unterstützten
DJI-Pilot-2-Konfigurationspfad.

## Herunterfahren

Bei `SIGINT` oder `SIGTERM`:

- Missions-Sweep wird beendet
- HTTP-Server werden geschlossen
- DJI-Adapter wird beendet
- MissionStore schließt seinen Connection Pool

## Weiterführende Dokumentation

- [API-Referenz](../../docs/API.md)
- [Betrieb](../../docs/BETRIEB.md)
- [Konfiguration](../../docs/KONFIGURATION.md)
- [Missionen](../../docs/MISSIONEN.md)
- [Persistenz](../../docs/PERSISTENZ.md)
- [RTK und NTRIP](../../docs/RTK_NTRIP.md)
- [EMQX AuthN/AuthZ](../../docs/EMQX-AUTHZ.md)
- [DJI-MQTT-Sicherheit](../../docs/DJI_MQTT_SECURITY.md)
- [Fehlersuche](../../docs/FEHLERSUCHE.md)

## V3-Grenze

Vor V3 fehlen insbesondere noch:

- vollständiger Telemetrie-Writer
- vollständige V3-Persistenz
- finaler Root-Compose-Gesamtstart
- vollständige automatisierte Abnahme


## DJI Pilot Cloud Authority

Der Control-API-Prozess stellt den aktuellen DJI-Authority-Zustand read-only bereit:

```text
GET /api/dji/gateways/{gateway_sn}/authority
```

Mögliche Zustände:

```text
unknown
pending
authorized
denied
canceled
released
timeout
```

Der eigentliche Pilot-Consent-Flow ist im DJI-Adapter gekapselt:

```text
cloud_control_auth_request
        ↓
Popup am DJI-Controller
        ↓
cloud_control_auth_notify
        ↓
status = ok | failed | canceled
```

Ein erfolgreiches `services_reply` allein aktiviert keine Flugsteuerung.

Cloud-Control ist im DJI-Runtime-Profil aktiviert. Der öffentliche API-Endpunkt
liefert den Authority-Zustand weiterhin nur read-only; die eigentliche
`cloud_control_auth_request`-Ausführung bleibt im zentralen
ControlCoordinator und damit hinter FC3, Control Lease und den
DRC-Sicherheitsguards.

Für Mavic 3 Enterprise wird das RC-Pro-Cloud-Control-Profil nur bei eindeutig
erkannter Produkt-/Gateway-Topologie freigegeben. Es ist auf Payload-Control
begrenzt: `flightControl=false`, `stick_control=false` und
`drone_control=false`. Cloud-Control-Authority bleibt für den Payload-Consent
relevant.
