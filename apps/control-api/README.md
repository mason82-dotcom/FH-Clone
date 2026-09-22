# FH-Clone Control API

Zentraler Backend-Prozess für:

- DJI Cloud MQTT-Ingest
- Device-/Parameter-Registry
- DJI Gateway↔Sub-Device-Topologie
- RTK/GNSS-Status und Fix-Verlust-Events
- öffentliche Read-API
- interne EMQX-Autorisierung

## Ports

- `8080`: öffentliche FH-Clone API
- `8081`: interne API für Infrastruktur; **nicht ins Internet veröffentlichen**

## DJI

Wenn `DJI_MQTT_URL` gesetzt ist, startet der Prozess den DJI-Cloud-Adapter.

Umgebungsvariablen:

- `DJI_MQTT_URL`
- `DJI_MQTT_USERNAME`
- `DJI_MQTT_PASSWORD`
- `DJI_MQTT_CLIENT_ID`
- `DJI_CLOUD_API_VERSION`

## Öffentliche Read-API

```text
GET /health
GET /api/devices
GET /api/dji/topology
GET /api/devices/{device_sn}/telemetry

GET /api/rtk
GET /api/devices/{device_sn}/rtk
GET /api/rtk/transitions
GET /api/events/rtk
```

### RTK-Snapshot

`GET /api/rtk` liefert alle aktuell bekannten Aircraft-RTK-Snapshots.

`GET /api/devices/{device_sn}/rtk` liefert den Zustand eines einzelnen Aircraft.

Ein Snapshot enthält unter anderem:

```json
{
  "deviceId": "AIRCRAFT_SN",
  "gatewaySn": "RC_PRO_SN",
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

Nach fünf Sekunden ohne neues RTK-relevantes OSD/State-Paket wird der Snapshot lokal als `stale` markiert. Das ist eine Monitoring-Regel von FH-Clone, keine DJI-Protokollkonstante.

### Fix-Transition-History

```text
GET /api/rtk/transitions
GET /api/rtk/transitions?device=<device_sn>
```

Gespeichert werden nur echte Zustandswechsel:

```text
false -> true = acquired
true  -> false = lost
```

Der Speicher ist aktuell bewusst flüchtig und auf die letzten 200 Transitionen begrenzt.

### RTK Live-Events

`GET /api/events/rtk` ist ein Server-Sent-Events-Stream.

Optionaler Aircraft-Filter:

```text
GET /api/events/rtk?device=<device_sn>
```

Eventtypen:

- `snapshot`
- `rtk-status`
- `rtk-fix-transition`

Dadurch kann die WebUI Fix-Status, Satellite-Chart und Fix-Loss-Warnungen live aktualisieren, ohne MQTT-Credentials im Browser zu hinterlegen.

## Topologie

`update_topo` auf `sys/product/{gateway_sn}/status` füllt die Gateway-Registry.

Für RC Pro Enterprise gilt:

```text
RC-Pro-SN (Gateway)
   └── Aircraft-SN (Sub-Device)
```

Aircraft-OSD/State wird nach `device_sn` verarbeitet. Service- und DRC-Pfade werden über `gateway_sn` geroutet.

## NTRIP-Grenze

NTRIP Host, Port, Benutzername, Passwort und Mountpoint werden nicht über die Control API gesetzt oder gespeichert.

FH-Clone verarbeitet ausschließlich den read-only RTK/GNSS-Zustand aus der DJI-Telemetrie.

## EMQX

`POST /internal/emqx/authz` ist ausschließlich für den internen EMQX-Authorizer vorgesehen.

Andere Rollen werden mit `ignore` an die nachfolgende Datei-ACL weitergegeben.
