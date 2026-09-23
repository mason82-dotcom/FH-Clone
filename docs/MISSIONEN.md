# Missionen und automatische Flugsitzungen

## Zweck

FH-Clone ordnet Telemetrie, RTK-Snapshots und spätere Medien einer
Flugsitzung zu, ohne dafür bereits eine aktive Missionssteuerung freizugeben.

Die automatische Missionssitzung ist zunächst ein **Beobachtungs- und
Korrelationsmodell**.

## Status

Implementiert:

- automatische Erkennung einer flugaktiven Sitzung aus DJI-`mode_code`
- eindeutige `missionId`
- Zuordnung zu `deviceId`
- optionale `gatewaySn`
- Start- und Endzeit
- Endgrund
- letzte Telemetriezeit
- letzter Moduscode
- Verknüpfung der RTK-Snapshots mit der aktiven `missionId`

Noch nicht V3-final:

- vollständige Telemetrie- und Medienkorrelation
- Korrelation mit Medien
- Korrelation mit UgCS/FH2-Tasks
- schreibende Missionsausführung

## Automatischer Start

Eine Sitzung startet, wenn Telemetrie einen als flugaktiv eingestuften
`mode_code` meldet.

Aktuell berücksichtigte flugaktive Modi:

```text
3   manuelle Flugphase
4   automatischer Start
5   Wayline-Flug
6   Panorama
7   intelligentes Tracking
8   ADS-B-Ausweichzustand
9   automatisches RTH
10  automatische Landung
11  erzwungene Landung
12  Drei-Blatt-Landung
15  APAS
16  Virtual-Stick-Zustand
17  Live Flight Controls
18  Airborne RTK Fixing Mode
```

Die Codes 1 und 2 gelten als Startvorbereitung und erzeugen noch keine
automatische Flugsitzung.

## Automatisches Ende

### Standby

`mode_code == 0` beendet die Sitzung erst nach einer lokalen
Standby-Nachlaufzeit.

Aktueller Standard:

```text
5 Sekunden
```

### Gerät nicht verbunden

`mode_code == 14` beendet die Sitzung erst nach einer längeren
Disconnect-Nachlaufzeit.

Aktueller Standard:

```text
30 Sekunden
```

### Telemetrie-Timeout

Wenn während einer aktiven Sitzung keine relevante Telemetrie mehr eintrifft,
beendet der periodische Sweep die Sitzung.

Aktueller Standard:

```text
30 Sekunden
```

Diese Zeiten sind FH2-Laufzeitregeln, keine DJI-Protokollkonstanten.

### Semantischer Endzeitpunkt

Grace-Zeiten bestätigen einen Zustand, verschieben aber nicht die historische
Fluggrenze. Bei bestätigt stabilem Standby oder Disconnect wird daher der
Zeitpunkt des **ersten** terminalen Frames als `endedAt` verwendet.

Beim Telemetrie-Timeout ist `endedAt` deterministisch:

```text
lastTelemetryAt + telemetryTimeoutMs
```

Damit beeinflusst der 5-Sekunden-Sweep nicht die gespeicherte Flugdauer.

## Endgründe

```text
standby
telemetry_timeout
device_disconnected
manual
service_restart  (Persistenz-Recovery, nicht regulärer Tracker-Endgrund)
```

## Öffentliche API

### Aktive Sitzungen

```http
GET /api/missions/active
```

### Sitzung eines Geräts

```http
GET /api/devices/{device_sn}/mission
```

Antwort enthält:

- `active`
- `lastCompleted`

## Beispielobjekt

```json
{
  "missionId": "UUID",
  "deviceId": "AIRCRAFT_SN",
  "gatewaySn": "GATEWAY_SN",
  "source": "automatic",
  "startedAt": 1790040000000,
  "lastTelemetryAt": 1790040005000,
  "lastModeCode": 5
}
```

Nach Ende kommen zusätzlich hinzu:

```json
{
  "endedAt": 1790040600000,
  "endReason": "standby"
}
```

## RTK-Korrelation

Der RTK-Dienst erhält die aktive `missionId` über den MissionSessionTracker.

Damit kann ein RTK-Snapshot während einer Flugsitzung eindeutig dem
automatisch erkannten Flugkontext zugeordnet werden.

## Persistenz

Der Laufzeit-Tracker ist In-Memory. Zusätzlich kann die Control API
automatisch erkannte Missionssitzungen bereits in TimescaleDB/PostgreSQL
persistieren, wenn `TIMESCALE_URL` gesetzt ist.

Persistiert werden Start, Ende, Endgrund, Gateway-/Drone-SN,
Produktidentität und optionale nicht-sensitive RTK-Quellenmetadaten.

Beim Start der Control API werden in TimescaleDB noch offene automatische
Missionszeilen **vor neuem DJI-Ingest** abgeschlossen:

```text
end_reason = service_restart
ended_at   = Startzeitpunkt des neuen Dienstprozesses
```

Die alte Sitzung wird damit nicht unsicher als aktiv fortgesetzt. Neue
Telemetrie kann anschließend eine neue automatische Sitzung erzeugen.

Noch offen ist die vollständige persistente Telemetrie- und Medienkorrelation.
Details: [Persistenz](PERSISTENZ.md).

Der Runtime-Tracker bleibt bewusst In-Memory. TimescaleDB speichert Historie
und Analysezustand, ist aber **keine Runtime-Autoritätsquelle**. Eine nach
Backend-Neustart noch offene Missionszeile darf später nur mit expliziter
Freshness-Prüfung korreliert werden. DRC-/Control-Sessions werden niemals aus
historischer Persistenz reaktiviert.

Der Control-API-Pfad erzeugt/persistiert die automatische `missionId`, bevor
derselbe Raw-Frame an den RTK-Service weitergereicht wird. Dadurch verwenden
Live-RTK und der spätere Telemetrie-Schreibpfad dieselbe Missions-ID.

## Wayline-Status ist keine Wayline-Capability

`mode_code == 5` bedeutet im aktuellen DJI-Telemetrievertrag, dass das
Aircraft einen Wayline-Flug ausführt. FH2 verwendet diesen Wert ausschließlich
zur Missions-/Flugsitzungsbeobachtung.

Er bedeutet nicht, dass der DJI-Cloud-Adapter selbst Waylines verwalten,
hochladen oder starten kann.

Der aktuelle Stand meldet daher aus diesem Zustand keine:

```text
mission.wayline
```

DJI Pilot Wayline Management ist ein eigener JSBridge-/HTTPS-/Dateipfad und
muss als separate Integration implementiert und abgenommen werden.

DJI Pilot Wayline Management ist ein eigener HTTPS-/Dateipfad.

FH2 implementiert read-only:

- DJI-WPML-`template.kml`-/`waylines.wpml`-Parsing,
- KMZ-Strukturprüfung,
- den Pilot-to-Cloud-Waypoint-Dateikatalog,
- authoritative `MissionExternalReference`-Korrelation aus einer echten
  Pilot-Wayline-Datei-ID.

Weiterhin **nicht** implementiert sind Upload, Collect, Download-Proxy, STS und
Missionsausführung. Deshalb erzeugt dieser read-only Pfad weiterhin keine
`mission.wayline`-Capability.

Details: [WPML](WPML.md).

## Verhältnis zu UgCS und FlightHub 2

Die automatische Flugsitzung ist nicht gleichbedeutend mit:

- UgCS-Mission
- FH2 Flight Task
- Wayline-ID
- DJI Mission-ID

V3 muss diese Objekte über explizite Korrelationsfelder verbinden.

Keine Zuordnung darf allein aufgrund ähnlicher Zeitstempel als authoritative
behandelt werden.

## Safety

Die automatische Missionserkennung ist lesend und unter FC0 zulässig.

Sie aktiviert niemals:

- Mission Execution
- RTH
- DRC
- Aircraft Control

Schreibende Missionsfunktionen beginnen frühestens mit FC2 und benötigen den
zentralen Command-/Authority-Pfad.

## Wayline-Beobachtungsmodell

FH2 V3 unterscheidet ausdrücklich zwischen einem beobachteten Wayline-Flug und
einer ausführbaren Wayline-Funktion.

Während einer automatischen Flugsitzung werden zusätzlich gepflegt:

```text
lastActivity
waylineObserved
```

Beispiel:

```json
{
  "lastModeCode": 5,
  "lastActivity": "wayline",
  "waylineObserved": true
}
```

`waylineObserved` bleibt für die laufende Flugsitzung wahr, sobald
`mode_code == 5` mindestens einmal beobachtet wurde. Wechselt das Aircraft
anschließend wieder in einen anderen Flugmodus, beschreibt `lastActivity`
den aktuellen/zuletzt beobachteten Zustand, während `waylineObserved` die
Wayline-Evidenz der Sitzung erhält.

### Read-API

```http
GET /api/devices/{device_sn}/wayline
```

Die Antwort enthält unter anderem:

- ob aktuell `mode_code == 5` aktiv ist,
- ob in der aktiven Flugsitzung ein Wayline-Zustand beobachtet wurde,
- gegebenenfalls die aktive `missionId`,
- gegebenenfalls die letzte abgeschlossene Sitzung mit Wayline-Evidenz,
- ob `mission.wayline` tatsächlich als ausführbare Adapter-Capability gemeldet wird.

Der aktuelle DJI-Cloud-Pfad liefert keine authoritative Wayline-ID. Deshalb bleibt:

```json
{
  "waylineId": null
}
```

solange kein eigener Pilot-Wayline-/WPML-/FH2-Task-Vertrag diese Identität liefert.

Wichtig:

```text
Wayline beobachtet
  !=
Wayline Management implementiert
  !=
mission.wayline ausführbar
```

## Externe Referenzen und Korrelation

Für die spätere Verbindung von automatischer Flugsitzung, FH2 Flight Task,
DJI Pilot Wayline, WPML und UgCS verwendet V3 `MissionExternalReference`.

Beispiel:

```json
{
  "kind": "wayline",
  "id": "WL-123",
  "source": "dji_pilot_wayline",
  "confidence": "authoritative"
}
```

Eine rein zeitliche Korrelation darf höchstens als `heuristic` geführt
werden. Sie darf niemals stillschweigend zu einer authoritative Referenz
hochgestuft werden.

`mode_code == 5` liefert nur die Aussage „Aircraft befindet sich in einem
Wayline-Flug“. Ohne separaten Wayline-/Task-Vertrag bleibt die eigentliche
Wayline-ID unbekannt.
