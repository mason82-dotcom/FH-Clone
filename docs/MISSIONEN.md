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
