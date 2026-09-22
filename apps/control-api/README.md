# FH2-Control-API

## Aufgabe

Die Control API ist der zentrale Backend-Prozess von FH-Clone.

Sie verbindet:

- DJI-Cloud-MQTT-Ingest
- Geräte- und Parameter-Registry
- Gateway-/Sub-Device-Topologie
- RTK-/GNSS-Auswertung
- öffentliche Lese-API
- interne EMQX-Autorisierung

Schreibende Flugsteuerung wird nicht direkt über öffentliche HTTP-Endpunkte
angeboten.

## Ports

| Port | Zweck | Veröffentlichung |
| --- | --- | --- |
| `8080` | öffentliche FH2-API | lokal/LAN nach Deployment-Regeln |
| `8081` | interne Infrastruktur-API | **nicht öffentlich veröffentlichen** |

Die Ports können über `PORT` und `INTERNAL_PORT` geändert werden.

## Startverhalten

Wenn `DJI_MQTT_URL` gesetzt ist, startet der Prozess den DJI-Cloud-Adapter
und verbindet sich mit dem konfigurierten MQTT-Broker.

Ohne `DJI_MQTT_URL` bleibt die API lauffähig, der DJI-Adapter ist jedoch
deaktiviert.

## Umgebungsvariablen

### HTTP

- `BIND` – Bind-Adresse der öffentlichen API, Standard `0.0.0.0`
- `PORT` – öffentlicher Port, Standard `8080`
- `INTERNAL_BIND` – Bind-Adresse der internen API, Standard `0.0.0.0`
- `INTERNAL_PORT` – interner Port, Standard `8081`

### DJI MQTT

- `DJI_MQTT_URL`
- `DJI_MQTT_USERNAME`
- `DJI_MQTT_PASSWORD`
- `DJI_MQTT_CLIENT_ID`
- `DJI_CLOUD_API_VERSION`

### Security und Diagnose

- `EMQX_AUTHZ_TOKEN` – internes Secret für EMQX -> Control API
- `LOG_RAW_DJI=1` – Rohmeldungen diagnostisch ausgeben
- `TIMESCALE_URL` – aktiviert Missionspersistenz über TimescaleDB/PostgreSQL
- `RTK_SOURCE_LABEL` – optionale nicht-sensitive Bezeichnung der RTK-Quelle
- `RTK_SOURCE_PROVIDER` – optionaler Anbietername

Secrets gehören in Runtime-Konfiguration und niemals ins Repository.

## Öffentliche API

### Gesundheit

```http
GET /health
```

Liefert den Dienststatus sowie den Zustand des DJI-Adapters.

### Geräte

```http
GET /api/devices
```

Liefert die aktuell bekannte DeviceRegistry.

### DJI-Topologie

```http
GET /api/dji/topology
```

Liefert die bekannten Gateways und Sub-Devices.

### Telemetrie eines Geräts

```http
GET /api/devices/{device_sn}/telemetry
```

Liefert den aktuellen normalisierten Parametersnapshot.

### Automatische Flugsitzungen

```http
GET /api/missions/active
GET /api/devices/{device_sn}/mission
```

Die Control API erkennt aus flugaktiven DJI-`mode_code`-Werten automatisch
eine Flugsitzung und vergibt eine `missionId`. Die aktuelle Zuordnung ist
In-Memory und dient zunächst der Korrelation von RTK-/Telemetriedaten.

Details: [Missionen](../../docs/MISSIONEN.md).

### Missionen

```http
GET /api/missions/active
GET /api/devices/{device_sn}/mission
```

`/api/missions/active` liefert die aktuell erkannten Missionssitzungen.

`/api/devices/{device_sn}/mission` liefert für ein Gerät:

- aktive Mission, sofern vorhanden
- zuletzt abgeschlossene Mission, sofern vorhanden

Die Missionszuordnung stammt aus dem laufenden `MissionSessionTracker`.
Persistente Missionshistorie ist Teil des V3-Persistenz-Gates.

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

## RTK-Snapshot

Ein Snapshot enthält unter anderem:

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

Ein Snapshot wird lokal als `stale` markiert, wenn über das konfigurierte
Monitoringfenster keine relevanten neuen Daten eintreffen. Diese Regel ist
eine FH2-Monitoringlogik und keine DJI-Protokollkonstante.

## RTK-Zustandswechsel

Gespeichert werden echte Fix-Wechsel:

```text
false -> true  = acquired
true  -> false = lost
```

Der aktuelle RTK-Verlauf ist In-Memory. RTK-Snapshots können zusätzlich die aktive `missionId` tragen. Automatische Missionssitzungen werden bei gesetztem `TIMESCALE_URL` bereits in TimescaleDB/PostgreSQL geöffnet und geschlossen.

## Interne EMQX-API

Aktuell implementiert:

```http
POST /internal/emqx/authz
```

Dieser Endpunkt darf nur durch EMQX im internen Servicenetz angesprochen
werden.

V3-Ziel zusätzlich:

```http
POST /internal/emqx/authn
```

Die geplante AuthN bindet Gateway-Credentials serverseitig an eine
vertrauenswürdige `gateway_sn`.

Details:

- [EMQX AuthN/AuthZ](../../docs/EMQX-AUTHZ.md)
- [DJI-MQTT-Sicherheit](../../docs/DJI_MQTT_SECURITY.md)

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
     +-- M3E/M3T/M3M
         device_sn
```

Aircraft-`osd/state` wird nach `device_sn` verarbeitet. Gateway-Services
werden über `gateway_sn` geroutet.

## NTRIP-Grenze

Für M3E/M3T/M3M speichert oder setzt die Control API keine NTRIP-Credentials.

Host, Port, Mountpoint, Benutzername und Passwort bleiben im unterstützten
DJI-Pilot-2-Konfigurationspfad.

## Fehlersuche

Bei fehlender DJI-Verbindung zuerst prüfen:

1. `DJI_MQTT_URL`
2. Credentials
3. Broker-Erreichbarkeit
4. EMQX-ACL/AuthZ
5. Topic-Rechte
6. `update_topo`

Bei fehlenden RTK-Werten prüfen:

1. Aircraft sendet `osd/state`
2. Payload enthält RTK-/GNSS-Felder
3. `device_sn` wird korrekt erkannt
4. Snapshot ist nicht nur `stale`

## Lokale Betriebsdokumentation

- [API-Referenz](../../docs/API.md)
- [Betrieb](../../docs/BETRIEB.md)
- [Konfiguration](../../docs/KONFIGURATION.md)
- [Fehlersuche](../../docs/FEHLERSUCHE.md)
- [Glossar](../../docs/GLOSSAR.md)

## V3-Grenze

Vor V3 fehlen noch:

- vollständige Persistenz
- HTTP AuthN
- finaler Root-Compose-Gesamtstart
- vollständige automatisierte Abnahme


## Automatische Flugsession / mission_id

Der Control-Service erzeugt für Ad-hoc-Flüge automatisch eine flüchtige Session-ID, die bei aktivierter Timescale-Persistenz synchron in `missions` angelegt wird.

Start nur bei flugaktiven DJI-`mode_code`-Werten:

```text
3  Manual flight
4  Automatic takeoff
5  Wayline flight
6  Panoramic photography
7  Intelligent tracking
8  ADS-B avoidance
9  Auto returning to home
10 Automatic landing
11 Forced landing
12 Three-blade landing
15 APAS
16 Virtual stick state
17 Live flight controls
18 Airborne RTK fixing mode
```

Kein automatischer Start bei:

```text
0  Standby
1  Takeoff preparation
2  Takeoff preparation completed
13 Upgrading
14 Not connected
```

Beendigung:

- `mode_code = 0` mindestens 5 s stabil -> `standby`
- 30 s ohne Telemetrie -> `telemetry_timeout`
- 30 s stabil `mode_code = 14` -> `device_disconnected`
- Service-Neustart schließt alte offene DB-Sessions mit `service_restart`

Öffentliche Read-Endpunkte:

```text
GET /api/missions/active
GET /api/devices/{device_sn}/mission
```

Der aktuelle `missionId` wird außerdem in RTK-Snapshots und RTK-SSE-Events mitgeführt.

## TimescaleDB-Persistenz

Aktivierung:

```text
TIMESCALE_URL=postgres://fhclone:<passwort>@timescaledb:5432/fhclone
```

Optional sichere RTK-Quellenmetadaten:

```text
RTK_SOURCE_LABEL=SAPOS BW
RTK_SOURCE_PROVIDER=Landesdienst
```

Ohne `TIMESCALE_URL` bleibt der komplette Live-/RTK-Pfad funktionsfähig; Persistenz ist optional und darf die Telemetrie nicht blockieren.
