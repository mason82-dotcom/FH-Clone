# Datenmodell und Persistenz

## Zweck

FH2 trennt Laufzeitmodelle im Aircraft Core von der geplanten V3-Persistenz.

Die In-Memory-Registries bleiben für schnelle Laufzeitentscheidungen wichtig.
TimescaleDB/PostgreSQL ergänzt sie um Historie und Neustartfestigkeit.

## Aktuell implementierte Core-Typen

## Geräteidentität

```text
DeviceIdentity
  id
  vendor
  serialNumber?
  model?
  productType?
```

Ein Gerät kann über mehrere Adapter gleichzeitig sichtbar sein.

## AdapterDevice

```text
identity
adapterId
capabilities[]
connected
lastSeenAt
```

Die `DeviceRegistry` speichert pro `deviceId` getrennte Einträge je Adapter.

## ParameterSample

```text
adapterId
deviceId
key
rawKey?
value
unit?
sampledAt
quality?
```

Qualität:

```text
good
stale
invalid
unknown
```

Die aktuelle `ParameterRegistry` hält pro Gerät und Key nur den neuesten
Sample.

## RawMessage

```text
adapterId
deviceId?
receivedAt
channel
payload
```

Rohmeldungen sind die verlustfreie Hersteller-/Protokollebene.

## Capability

Beispiele:

```text
telemetry.flight
telemetry.battery
telemetry.rtk
telemetry.camera
telemetry.gimbal
control.camera
control.gimbal
payload.control
mission.wayline
control.flight
control.rth
control.pointing
control.orbit
media.read
livestream.read
```

Capabilities sind Laufzeitinformationen und keine Safety-Freigabe.

## ControlLease

```text
deviceId
adapterId
owner
expiresAt
```

Die aktuelle Implementierung ist In-Memory.

## DJI-Topologie

```text
DjiGatewayTopology
  gatewaySn
  product
  subDevices[]
  updatedAt
```

Sub-Device:

```text
sn
index?
product
```

Die `DjiTopologyRegistry` verwaltet zusätzlich die Rückauflösung
`device_sn -> gateway_sn`.

## RTK-Missionskontext

```text
MissionRtkContext
  source?
  takeoff?
  landing?
  minimumRtkSatellites?
  fixLossCount?
```

Ein RTK-Snapshot enthält unter anderem:

- deviceId
- sampledAt
- fixStatus
- fixed
- qualityCode
- GPS-Satelliten
- RTK-Satelliten

## Sichere Korrekturquellenreferenz

Erlaubt:

```text
label
provider?
note?
configuredVia=dji-pilot-2
```

Nicht im Typ repräsentierbar:

- Host
- Port
- Mountpoint
- Username
- Passwort
- Token

## V3-Persistenz

Ein erstes TimescaleDB-/PostgreSQL-Schema ist implementiert:

- relationale Tabelle `missions`
- Hypertable `telemetry`
- kontinuierliches Aggregat `telemetry_1m`
- MissionStore für automatische Missionssitzungen

Weitere fachliche Bereiche bleiben V3-Ziel:

### Geräte

Vorgeschlagene fachliche Entität:

```text
device
adapter
identity
capability snapshot
connected/last_seen
```

Die konkrete Tabellenstruktur wird erst mit der Implementierung verbindlich.

### Rohmeldungen

Zu speichern:

- Adapter
- Device/Gateway
- Topic/Kanal
- Empfangszeit
- Payload
- optional Correlation-/Trace-ID

Rohdaten dürfen nicht durch Normalisierung ersetzt werden.

### Normalisierte Parameter

Historisch speicherbar:

- deviceId
- adapterId
- key
- rawKey
- value
- unit
- quality
- sampledAt

### Topologie

Wichtig:

- Gateway-SN
- Sub-Device-SN
- Produktreferenz
- gültig ab/bis beziehungsweise Update-Zeit
- Quelle

Eine alte persistierte Topologie darf nicht automatisch als aktuelle
Autorisierungsquelle verwendet werden.

Die laufende AuthZ muss sich auf aktuelle Runtime-Topologie stützen.

### AuthN/AuthZ-Audit

Mindestens:

- Zeitpunkt
- Principal
- Gateway-SN
- Client-ID diagnostisch
- Aktion
- Topic
- Entscheidung
- Reason-Code
- Correlation-ID

### Media

V3-Zielobjekte:

```text
MediaAsset
SensorSource
SpectralBand
CaptureContext
ProcessingProfile
```

Siehe [MEDIEN_MULTISPEKTRAL.md](MEDIEN_MULTISPEKTRAL.md).

### Missionen

Persistenz soll aktive und abgeschlossene Missionskontexte voneinander
trennen.

Mindestens relevant:

- Mission-ID
- Device-ID
- Gateway-ID
- Start/Ende
- Status
- RTK-Kontext
- Quelle/Adapter

## Autorisierungsquelle versus Persistenz

Wichtiges V3-Prinzip:

```text
TimescaleDB/PostgreSQL = Historie / Inventar / Neustartdaten
Runtime Registry = aktuelle Autorisierungswahrheit
```

Ein historischer Datenbankeintrag darf keine aktuelle Topic-Berechtigung
erzeugen, wenn die Runtime-Topologie ihn nicht bestätigt.

Dasselbe gilt für aktive DRC-Sitzungen: eine alte persistierte Sitzung darf
nach Neustart nicht automatisch wieder als aktiv gelten.

Für automatische Flugsitzungen ist dieses Prinzip bereits umgesetzt:
offene Datenbankzeilen werden beim Dienstneustart mit
`end_reason = service_restart` abgeschlossen; sie werden nicht als aktive
Laufzeitsitzung rehydriert.

## Zeitstempel

Alle persistierten Zustände benötigen eine eindeutige Zeitbasis.

Mindestens unterscheiden:

- Herstellerzeitstempel, wenn vorhanden
- Empfangszeit in FH2
- Normalisierungs-/Persistenzzeit, falls erforderlich

Originalzeitstempel nicht überschreiben.

## Datenqualität

Normalisierte Werte können folgende Qualität tragen:

```text
good
stale
invalid
unknown
```

Für Media-/Multispektral zusätzlich Quellenvertrauen:

```text
authoritative
derived
heuristic
unavailable
```

Diese Konzepte dürfen nicht vermischt werden.

## V3-Abnahme

Vor Release zu prüfen:

- Migrationen reproduzierbar
- Neustart ohne Verlust persistenter Historie
- Runtime-Registries korrekt neu aufgebaut
- historische Topologie erzeugt keine Rechte
- DRC-Sitzungen werden nicht unsicher rehydriert
- Raw Messages vollständig
- normalisierte Daten nachvollziehbar
- Audit ohne Secrets
