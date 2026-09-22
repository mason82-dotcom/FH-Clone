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

### GET /api/devices/{device_sn}/telemetry

Liefert den aktuellen normalisierten Parametersnapshot eines Geräts.

Unbekannte Herstellerfelder bleiben über die Rohdatenebene erhalten, werden
aber nicht automatisch als kanonische Parameter ausgegeben.

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

## V3-Zielendpunkt

### POST /internal/emqx/authn

Noch **nicht** als finaler V3-Pfad abgenommen.

Ziel:

- Gateway-Credential prüfen
- serverseitigen Principal auflösen
- vertrauenswürdige `gateway_sn` liefern
- `is_superuser = false`
- Client-Attribute für nachfolgende AuthZ bereitstellen

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

## Fehlercodes

Aktuell werden je nach Endpunkt JSON-Fehler ausgegeben.

Allgemeine Fälle:

- `404` – Ressource/Route nicht gefunden
- `400` – ungültige interne Anfrage
- `500` – unerwarteter öffentlicher API-Fehler

Für EMQX AuthZ gilt zusätzlich: Sicherheitsrelevante Evaluierungsfehler werden
bevorzugt als HTTP 200 mit `{"result":"deny"}` zurückgegeben, damit kein
ungewollter Fallback eine breitere Berechtigung erzeugt.

## Noch offen für V3

Die finale V3-API wird zusätzlich dokumentieren:

- Persistenz-/Historienendpunkte, falls öffentlich benötigt
- Medien-/Multispektralendpunkte
- Readiness
- AuthN intern
- stabile Fehlerobjekte
- Versionierung der öffentlichen API

Schreibende Flight-Control-Endpunkte gehören nicht zur
V3-Defaultkonfiguration.
