# API-Referenz

## Status

Diese Referenz beschreibt die aktuell auf `main` vorhandenen HTTP-Endpunkte
der FH2-Control-API.

Nicht implementierte V3-Zielendpunkte werden ausdrücklich als Ziel
gekennzeichnet.

## Basis

Standardmäßig:

```text
öffentliche API: http://<host>:8080
interne API:     http://<host>:8081
```

Die Ports sind konfigurierbar.

## Öffentliche API

### GET /health

Dienststatus.

Beispielstruktur:

```json
{
  "status": "ok",
  "service": "control-api",
  "dji": {
    "enabled": true,
    "connected": true,
    "apiVersion": "1.16.1"
  },
  "missions": {
    "active": 1
  }
}
```

Hinweise:

- `enabled` bedeutet, dass der DJI-Adapter konfiguriert wurde.
- `connected` beschreibt die aktuelle MQTT-Verbindung.
- ein gesunder HTTP-Prozess bedeutet nicht automatisch eine funktionierende
  DJI-Verbindung.

### GET /ready

Readiness der für den lokalen V3-Stack erforderlichen Backend-Abhängigkeiten.

Der Endpunkt liefert `200`, wenn die konfigurierten Runtime-Prüfungen
erfolgreich sind, andernfalls `503`.

FlightHub 2 OpenAPI ist optional und blockiert die allgemeine Readiness
nicht, wenn `FH2_ENABLED=false` gesetzt ist.

### POST /api/msdk/pair

Pairing-Endpunkt für die native FH2 RC Bridge auf DJI MSDK V5.

Der erste Request benötigt:

```http
Authorization: Bearer <MSDK_PAIRING_TOKEN>
```

Body ist ein vollständiger `fh2.msdk.v1`-BridgeSnapshot mit getrennten
`gateway`- und `aircraft`-Identitäten. Der Server akzeptiert nur Snapshots
mit verbundener RC, verbundenem Flight Controller sowie gültiger RC- und
Aircraft-Seriennummer.

Bei Erfolg wird ein zeitlich begrenztes, HMAC-signiertes Agent-Token
zurückgegeben. Das Token ist an genau diese `gatewaySn + aircraftSn`-
Kombination gebunden und enthält keine Flight-Control-Rechte.

### POST /api/msdk/unpair

Widerruft das aktuell präsentierte MSDK-Agent-Token dauerhaft bis zu dessen
Ablaufzeit und entfernt den zugehörigen Agent aus der Runtime.

```http
Authorization: Bearer <agentToken>
```

FH2 speichert dafür nur den SHA-256-Token-Digest in
`msdk_token_revocations`; der Bearer-Token selbst wird nicht persistiert.
Eine laufende Control-Session wird zuerst fail-closed beendet und der
zugehörige WSS-Agent-Transport mit Code `4004` geschlossen.

### POST /api/msdk/heartbeat

Read-only Snapshot-/Heartbeat-Ingest der gepairten Android-App.

```http
Authorization: Bearer <agentToken>
```

Der Agent-Token muss zur RC-/Aircraft-Identität im Snapshot passen. Dieser
Endpunkt nimmt **keine** Flight-Control-Kommandos an.

### GET /api/msdk/agents

Read-only Sicht auf die zuletzt von MSDK-Agents gemeldeten Snapshots und
`lastSeenAt`.


### WS /ws/msdk/control/{aircraftSn}

Authentifizierter Agent-Kanal für die native MSDK-Control-Session.

Upgrade-Header:

```http
Authorization: Bearer <agentToken>
```

Das Agent-Token muss zur angeforderten Aircraft-SN passen. Der Socket ist
**kein Operator-Endpunkt** und vergibt weder FC3 noch Control Lease.

Vor `session_start` prüft der Backend-`MsdkControlHub`:

- frischen MSDK-Agent-Snapshot,
- lokale Android-`NetworkControlArm`-Freigabe,
- MSDK-`virtualStick`-Capability,
- FC3,
- gültigen Control Lease für den gleichen Holder,
- gebundene Gateway-/Aircraft-Identität.

Controlframes besitzen monotone Sequenznummern und eine kurze Ablaufzeit.
Bei Guard-Verlust sendet der Server `neutral` vor `session_stop`.

Ein öffentlicher Operator-/Browser-Schreibendpunkt zum Öffnen der Session
oder Einspeisen von Sticks ist derzeit absichtlich nicht vorhanden.

Konfiguration:

```text
MSDK_PAIRING_TOKEN
MSDK_BRIDGE_TOKEN_SECRET
MSDK_BRIDGE_TOKEN_TTL_SECONDS   # Standard 86400
```

Die Token-Signatur ist stateless und dadurch auch bei mehreren
Control-API-Instanzen konsistent. Die aktuelle Snapshot-Liste selbst ist in
diesem Entwicklungsstand noch pro Prozess in-memory.

### GET /api/devices

Liefert die aktuell bekannte Geräte-Registry.

Die Antwort basiert auf der In-Memory-`DeviceRegistry`.

### GET /api/dji/topology

Liefert die vom DJI-Adapter bekannte Gateway-/Sub-Device-Topologie.

Typische Beziehung:

```text
gateway_sn
  -> device_sn
```

Die Daten stammen aus `update_topo`.

### GET /api/dji/topology/persisted

Liefert das persistierte Gateway-/Sub-Device-Inventar.

Dieses Inventar ist **keine** aktuelle AuthZ-Quelle. MQTT-Autorisierung
verwendet weiterhin ausschließlich die Runtime-Topologie.

Ohne aktivierte Topologie-Persistenz liefert der Endpunkt `503`.

### GET /api/dji/gateways/{gateway_sn}/authority

Liefert den aktuellen DJI Pilot Cloud-Control-Authority-Zustand eines
Gateways read-only. Der Endpunkt aktiviert selbst keine Flugsteuerung und
fordert keine Authority an.

Zusätzlich wird `cloudControlEnabled` aus der kanonischen globalen
Cloud-Control-Policy ausgegeben.

### GET /ready

Readiness unterscheidet pro Abhängigkeit drei Zustände:

```text
disabled    = nicht konfiguriert; blockiert Readiness nicht
ready       = konfiguriert und erreichbar
unavailable = konfiguriert, aber nicht bereit; blockiert Readiness
```

Beispiel:

```json
{
  "status": "ready",
  "service": "control-api",
  "checks": {
    "mqttBackend": {
      "configured": false,
      "ready": false,
      "state": "disabled"
    },
    "topologyStore": {
      "configured": true,
      "ready": true,
      "state": "ready"
    }
  }
}
```

Im Root-Compose sind MQTT und PostgreSQL konfiguriert und deshalb weiterhin
Pflicht für einen grünen Readiness-Status. Ein Minimal-/Entwicklungsstart ohne
diese optionalen Integrationen kann dagegen bewusst `disabled` melden.

### GET /api/dji/control/runtime

Read-only Sicht auf die zentrale DJI-Control-Runtime.

Die Antwort enthält ausschließlich nicht-sensitive Laufzeitinformationen:

```json
{
  "configured": true,
  "publicWriteApiEnabled": false,
  "fc3Default": false,
  "activeSessions": []
}
```

Der Endpunkt setzt weder FC3 noch einen Control Lease, fordert keine DJI
Authority an und sendet keine DRC-Steuerframes. DRC-Broker-Credentials werden
nicht ausgegeben.

### GET /api/devices/{device_sn}/telemetry

Liefert den **fusionierten** aktuellen normalisierten Parametersnapshot eines
Geräts.

Wenn mehrere Adapter denselben kanonischen Key für dieselbe `device_sn`
melden, gewinnt der neueste Sample. Bei identischem Zeitstempel entscheidet
deterministisch die Sample-Qualität und danach die Adapter-ID.

Dadurch können DJI Cloud API und MSDK V5 dieselben kanonischen Flug-/RTK-Keys
speisen, ohne die öffentliche API zu duplizieren.

Unbekannte Herstellerfelder bleiben über die Rohdatenebene erhalten.

### GET /api/devices/{device_sn}/telemetry/sources

Liefert die neuesten normalisierten Samples **je Adapter und kanonischem Key**.

Beispielstruktur:

```json
{
  "flight.position.latitude_deg": {
    "dji-cloud": {
      "adapterId": "dji-cloud",
      "value": 49.12
    },
    "msdk-v5": {
      "adapterId": "msdk-v5",
      "value": 49.1201
    }
  }
}
```

Dieser Endpunkt dient Provenienz, Diagnose und Plausibilitätsvergleich. Er
vergibt keine Control Authority und verändert keine Safety-Stufe.

### GET /api/devices/{device_sn}/capabilities

Read-only Capability-Sicht für ein Gerät.

Die Antwort trennt:

- tatsächlich gemeldete Adapter-Capabilities,
- DJI-Produktsupport beziehungsweise spezialisierten Control-Support,
- Wayline-/Missionsevidenz,
- Status des optionalen FH2-Read-Pfads.

DJI-Produktsupport erzeugt nicht automatisch eine ausführbare
`AircraftAdapter.execute()`-Capability.

### DJI Pilot Waypoint Management – read-only

```http
GET /api/dji/pilot/waylines/status
GET /api/dji/pilot/waylines?page=1&page_size=10
```

Optionale Filter:

```text
key
favorited
order_by            name|update_time|create_time + asc|desc
action_type         1 = AI Spot-Check
template_type       wiederholbar; 0..3
drone_model_keys    wiederholbar
payload_model_key   wiederholbar
```

Dieser Pfad spiegelt ausschließlich die DJI Pilot-to-Cloud-Waypoint-Dateiliste.
Er ist nicht mit `/api/fh2/waylines` gleichzusetzen und führt keine Mission
aus.

Der serverseitige `x-auth-token` wird nicht an den Browser ausgegeben.
Fehlende Konfiguration liefert
`503 dji_pilot_waylines_not_configured`; Upstream-/Businessfehler werden als
`502 dji_pilot_waylines_upstream_error` abgebildet.

DJI-`drone_model_key` und `payload_model_keys` bleiben eigene
Produktidentitäten und werden nicht in MQTT-`payload_index` umgedeutet.

Details: [WPML und Pilot-Waypoints](WPML.md).

### GET /api/missions/active

Liefert alle aktuell erkannten Missionssitzungen.

Die Erkennung erfolgt über den laufenden `MissionSessionTracker`.

### GET /api/devices/{device_sn}/mission

Liefert den Missionszustand eines Geräts.

Antwortstruktur:

```json
{
  "deviceId": "AIRCRAFT_SN",
  "active": null,
  "lastCompleted": null
}
```

Je nach Zustand können `active` und `lastCompleted` befüllt sein.

### GET /api/devices/{device_sn}/wayline

Read-only Wayline-Beobachtung aus DJI-Telemetrie.

`mode_code == 5` bedeutet, dass ein Wayline-Flug beobachtet wird. Der
Endpunkt erfindet keine Wayline-ID und aktiviert keine
`mission.wayline`-Capability.

### FlightHub 2 OpenAPI V2 – read-only

```http
GET /api/fh2/status
GET /api/fh2/waylines?page=1&size=100
GET /api/fh2/flight-tasks?page=1&page_size=50
```

`/api/fh2/status` enthält ausschließlich nicht-sensitive
Konfigurationszustände und `readOnly=true`.

Waylines und Flight Tasks werden ausschließlich per GET aus der FH2 OpenAPI
V2 gelesen. Redirects werden nicht verfolgt; nur HTTP 2xx und DJI
Businesscode `0` gelten als Erfolg.

Fehlende Konfiguration:

```http
503 {"error":"fh2_not_configured"}
```

FH2-Upstreamfehler:

```http
502 {"error":"fh2_upstream_error"}
```

Die gelieferten IDs können über `MissionExternalReference` korreliert
werden. Zeitliche Nähe allein gilt nicht als authoritative Zuordnung.

FlightHub-2-/SIKONG-CE-Livestreaming ist in FH2 V3 ausdrücklich deaktiviert.
Es gibt keinen lokalen Start-/Forwarding-Endpunkt und keine automatische
Aktivierung eines kostenpflichtigen Streaming-Kanals.

### UgCS – read-only Groundstation

```http
GET /api/ugcs/status
GET /api/ugcs/vehicles
GET /api/ugcs/routes
GET /api/ugcs/telemetry
```

Ohne `UGCS_BRIDGE_URL` liefern die UgCS-Endpunkte `503
ugcs_not_configured`. Bei konfigurierter, aber nicht erreichbarer Bridge wird
`502 ugcs_bridge_unavailable` geliefert.

`/api/ugcs/routes` enthält echte Segment-/FigurePoint-Geometrie aus UCS.
`/api/ugcs/telemetry` erhält zusätzlich die ursprüngliche UgCS-Semantik,
Subsystem und Feldcode.

### GET /api/media/overlays

Read-only Kartenfeed für georeferenzierte Thermal-/Multispektral-/NDVI-
Captures aus dem internen `MediaOverlayRegistry`.

Nur Assets mit gültiger realer Capture-Position werden als Overlaypunkt
ausgegeben.

### GET /api/rtk

Liefert alle aktuellen RTK-/GNSS-Snapshots.

### GET /api/devices/{device_sn}/rtk

Liefert den aktuellen RTK-Snapshot eines einzelnen Geräts.

Wenn kein RTK-Status bekannt ist:

```http
404
```

mit:

```json
{
  "error": "rtk_status_not_available",
  "deviceId": "AIRCRAFT_SN"
}
```

### GET /api/rtk/transitions

Liefert die zuletzt erkannten RTK-Fix-Zustandswechsel.

Optional:

```http
GET /api/rtk/transitions?device={device_sn}
```

### GET /api/events/rtk

Server-Sent-Events-Stream für RTK.

Optionaler Filter:

```http
GET /api/events/rtk?device={device_sn}
```

Der Browser benötigt dafür keine MQTT-Credentials.

## Interne API

Die interne API darf nicht öffentlich exponiert werden.

### GET /health

Gesundheitsstatus des internen Control-API-Servers.

### POST /internal/media/dji-m3m

Interner, token-geschützter M3M-Metadaten-Normalizer.

Er erwartet **bereits extrahierte** EXIF/XMP-Felder und liest keine Bilddatei
selbst:

```json
{
  "assetId": "capture-red-001",
  "deviceId": "M3M-001",
  "sensorId": "m3m-camera",
  "fileName": "DJI_0001.TIF",
  "metadata": {
    "drone-dji:BandName": "Red",
    "drone-dji:CaptureUUID": "capture-set-id",
    "drone-dji:GpsLatitude": 49.0,
    "drone-dji:GpsLongitude": 8.0
  }
}
```

Authentisierung erfolgt mit demselben `MEDIA_INGEST_TOKEN` wie beim direkten
MediaAsset-Ingest.

Der Mapper:

- klassifiziert M3M-Bänder nur über dokumentiertes `BandName`,
- rät kein Band aus Dateiname oder `SensorIndex`,
- übernimmt reale GPS-/Höhen-/Pose-/RTK-Metadaten in `CaptureContext`,
- erhält `CaptureUUID` zur Capture-Set-Korrelation,
- meldet widersprüchliche Herstellerfelder in `conflicts`,
- speist das normalisierte `MediaAsset` unmittelbar in den Overlay-Registry.

### POST /internal/media/assets

Interner Batch-/Single-Ingest für `MediaAsset`-Objekte.

Authentisierung:

```http
Authorization: Bearer <MEDIA_INGEST_TOKEN>
```

Der Endpunkt akzeptiert maximal 500 Assets pro Request. Ungültige
Capture-Koordinaten oder unvollständige Domainobjekte werden mit `400`
abgelehnt. Der interne Port darf nicht öffentlich exponiert werden.

### POST /internal/emqx/authz

Aktuell implementierter EMQX-HTTP-Authorizer.

Beispiel einer Anfrage:

```json
{
  "username": "dji-gateway-example",
  "clientid": "MQTT_SESSION_ID",
  "peerhost": "10.0.0.20",
  "action": "publish",
  "topic": "thing/product/AIRCRAFT_SN/osd",
  "qos": "0"
}
```

Mögliche Antworten:

```json
{"result":"allow"}
```

```json
{"result":"deny"}
```

```json
{"result":"ignore"}
```

Dynamische DJI-Anfragen benötigen das interne Bearer-Secret
`EMQX_AUTHZ_TOKEN`.

Bei internen Evaluierungsfehlern wird dynamische DJI-Autorisierung
fail-closed mit `deny` behandelt.

### POST /internal/emqx/authn

Implementierter interner EMQX-HTTP-Authenticator.

Er:

- prüft Gateway-Credentials gegen den PostgreSQL-Credential-Store
- löst den serverseitig gebundenen Principal auf
- liefert die vertrauenswürdige `gateway_sn`
- setzt `is_superuser = false`
- stellt `client_attrs.role` und `client_attrs.gateway_sn` für die nachfolgende AuthZ bereit
- antwortet bei AuthN-Fehlern fail-closed mit HTTP 200 + `deny`

Siehe:

- [DJI-MQTT-Sicherheit](DJI_MQTT_SECURITY.md)
- [EMQX AuthN/AuthZ](EMQX-AUTHZ.md)

## Sicherheitsregeln

Öffentliche API:

- keine MQTT-Passwörter
- keine DRC-Credentials
- keine NTRIP-Secrets
- keine direkten Browser-MQTT-Schreibrechte

Interne API:

- nicht öffentlich routen
- Service-Authentisierung
- Fail-Closed für dynamische DJI-Rechte

## DJI OpenAPI-/Gerätefehlerreferenz

Herstellerseitige DJI-Business-/Gerätefehler werden getrennt von den
HTTP-Fehlern der FH2-Control-API behandelt.

Referenz:

- [FlightHub 2 OpenAPI – Fehlerreferenz](FH2_OPENAPI_FEHLERCODES.md)

Ein DJI-Code wie `321776`, `324012`, `238001` oder `312011` wird nicht
automatisch in einen HTTP-Status oder eine Safety-Aktion übersetzt. FH2 soll
bei späterer strukturierter Auswertung mindestens den originalen Code, die
Rohmeldung und den Quellendpunkt erhalten.

## Fehlercodes

Aktuell werden je nach Endpunkt JSON-Fehler ausgegeben.

Allgemeine Fälle:

- `400` – ungültige Query-/Anfrageparameter
- `404` – Ressource/Route nicht gefunden
- `502` – konfigurierter FH2-Upstream lieferte keinen gültigen Erfolg
- `503` – optionale Ressource ist nicht konfiguriert/verfügbar
- `500` – unerwarteter öffentlicher API-Fehler

Für EMQX AuthZ gilt zusätzlich: Sicherheitsrelevante Evaluierungsfehler werden
bevorzugt als HTTP 200 mit `{"result":"deny"}` zurückgegeben, damit kein
ungewollter Fallback eine breitere Berechtigung erzeugt.

## Noch offen für V3

Die finale V3-API wird zusätzlich dokumentieren:

- Persistenz-/Historienendpunkte, falls öffentlich benötigt
- Medien-/Multispektralendpunkte
- Readiness
- stabile Fehlerobjekte
- Versionierung der öffentlichen API

Schreibende Flight-Control-Endpunkte gehören nicht zur
V3-Defaultkonfiguration.
