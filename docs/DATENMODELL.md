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

Die `ParameterRegistry` hält pro Gerät und kanonischem Key einen
fusionierten aktuellen Sample und zusätzlich den neuesten Sample je Adapter.

Fusion:

```text
deviceId + canonical key
  -> dji-cloud latest
  -> msdk-v5 latest
  -> ...
  -> fused current
```

Primär entscheidet `sampledAt`. Bei gleichem Zeitstempel folgt die
Qualitätsreihenfolge `good > unknown > stale > invalid`; danach sorgt die
Adapter-ID nur für einen deterministischen Tie-Break.

Die adapterbezogenen Werte bleiben über
`snapshotSources(deviceId)` beziehungsweise den öffentlichen
`/telemetry/sources`-Endpunkt sichtbar.

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

Capabilities in `AdapterDevice.capabilities[]` sind **routbare
Laufzeitinformationen** und keine Safety-Freigabe.

Ein Hersteller kann eine Funktion unterstützen, ohne dass FH2 dafür bereits
einen ausführbaren Adapterpfad besitzt. Solcher reine Produktsupport darf
nicht als `AdapterDevice`-Capability gemeldet werden.

Spezialisierte Runtime-Pfade, zum Beispiel M4-DRC, führen ihren
Produktsupport separat und bleiben zusätzlich Safety-/Authority-gated.

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

## Externe Missions- und Wayline-Referenzen

Der Aircraft Core besitzt für V3 einen expliziten Referenzvertrag:

```text
MissionExternalReference
  kind
  id
  source
  confidence
```

Unterstützte Arten:

```text
wayline
fh2_flight_task
dji_mission
ugcs_mission
```

Unterstützte Quellen:

```text
fh2_openapi_v2
dji_pilot_wayline
dji_wpml
ugcs
manual
```

Vertrauensstufen:

```text
authoritative
derived
heuristic
```

Eine Referenz-ID muss nicht leer sein und wird normalisiert.

Wichtig:

- ähnliche Zeitstempel allein sind niemals `authoritative`,
- DJI-`mode_code == 5` erzeugt keine Wayline-ID,
- FH2-Task-ID und DJI-Wayline-ID bleiben getrennte Referenzarten,
- jede Korrelation muss ihre Quelle und Vertrauensstufe behalten.


## MediaStore und Telemetrie-Fusion

Die adapterübergreifende Live-Telemetrie und die MediaAsset-Persistenz sind
getrennte Datenebenen:

```text
Live-Telemetrie
  -> ParameterRegistry
  -> fused current + per-adapter provenance

MediaAsset
  -> MediaStore / TimescaleDB
  -> MediaOverlayRegistry rehydration
```

Ein MediaStore-Ausfall beeinflusst die Readiness, erzeugt aber keine
alternative Telemetriequelle. Umgekehrt ersetzt die Telemetrie-Fusion keine
MediaAsset-Persistenz.
