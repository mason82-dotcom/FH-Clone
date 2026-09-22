# DJI Capability-Matrix für FH2 V3

## Zweck

Dieses Dokument ist die verbindliche Abbildung zwischen der offiziellen
DJI-Cloud-API-Produkt-/Funktionsdokumentation und den in FH2 V3 tatsächlich
freigegebenen Capabilities.

Grundregel:

```text
DJI dokumentiert Funktion
    !=
FH2 gibt Funktion automatisch frei
```

FH2 benötigt zusätzlich:

- eindeutige Produktidentität aus `domain + type + sub_type`
- passendes Gateway
- zur Laufzeit bekannte Topologie
- Capability-Profil
- Safety-Stufe
- Control Lease
- bei Cloud Control: DJI Control Authority
- bei DRC: aktive DRC-Sitzung und Dead-Man

## Verbindliche Produktidentität

DJI definiert ein Gerät über:

```text
domain + type + sub_type
```

FH2 darf daher nicht nur anhand von `type` entscheiden.

### Gateways

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| DJI RC Pro Enterprise | 2 | 144 | 0 |
| DJI RC Plus | 2 | 119 | 0 |
| DJI RC Plus 2 | 2 | 174 | 0 |
| DJI Dock 3 | 3 | 3 | 0 |

### Aircraft im aktuellen Pilot-to-Cloud-Profil

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| Mavic 3 Enterprise | 0 | 77 | 0 |
| Mavic 3 Thermal | 0 | 77 | 1 |
| Mavic 3TA | 0 | 77 | 3 |
| Matrice 4E | 0 | 99 | 0 |
| Matrice 4T | 0 | 99 | 1 |

### Aircraft im Dock-to-Cloud-Profil

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| Matrice 4D | 0 | 100 | 0 |
| Matrice 4TD | 0 | 100 | 1 |

Unbekannte Domains oder Subtypen werden **fail-closed** behandelt.

## Live-Control-Matrix

| Funktion | M3E/M3T/M3TA + RC Pro Enterprise | M4E/M4T + RC Plus 2 | FH2 V3 Runtime |
| --- | --- | --- | --- |
| Kamera-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `control.camera`-Werbung |
| Gimbal-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `control.gimbal`-Werbung |
| Payload-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `payload.control`-Werbung |
| Flugsteuerung / Stick | nicht für M3-Pilot-Cloud | DJI dokumentiert | M4: spezialisierter ControlCoordinator/DRC-Pfad implementiert; keine generische Adapter-Capability |
| Return-to-Home | nicht freigegeben | DJI dokumentiert `return_home` / `return_home_cancel` | nicht implementiert |
| FlyTo | nicht freigegeben | DJI dokumentiert | M4: `DrcController.flyToPoint()` implementiert |
| Pointing Flight | nicht freigegeben | DJI dokumentiert | nicht implementiert |
| Orbit / POI | nicht freigegeben | DJI dokumentiert | nicht implementiert |
| One-key Takeoff | nicht freigegeben | DJI dokumentiert | nicht implementiert / V3-Freeze |
| Forced/Emergency Landing | nicht freigegeben | DJI dokumentiert | nicht implementiert / V3-Freeze |
| Emergency Stop | nicht für M3-Flugsteuerung | DJI dokumentiert | M4: interner FC3-/DRC-Pfad implementiert |

Die letzten drei Funktionen werden trotz DJI-Unterstützung im V3-Freeze nicht
als neue öffentliche Produktfunktion aufgenommen.

## Mavic 3 Enterprise Series

DJI beschreibt für den Pilot-to-Cloud-Live-Control-Pfad:

- Cloud-Steuerung der Payload
- Gimbal
- Zoom
- Infrarot-Funktionen bei geeigneter Kamera

DJI beschreibt **keine Cloud-Flugsteuerung** für die Mavic-3-Enterprise-Serie
in diesem Pfad. Die physische RC kann während der Cloud-Payload-Steuerung
weiterhin das Aircraft fliegen.

DJI-seitig ist dieser Payload-Support bestätigt. FH2 V3 implementiert jedoch
noch keinen routbaren Kamera-/Gimbal-/Payload-Command-Pfad. Deshalb werden
diese Schreib-Capabilities **nicht** in `AdapterDevice.capabilities[]`
gemeldet.

Der Produktvertrag bleibt dokumentiert, ohne eine ausführbare Funktion
vorzutäuschen.

## Matrice 4 Series

DJI beschreibt hinter RC Plus 2:

- Cloud Flight Control
- Payload Control
- Stick Control
- FlyTo
- Pointing Flight
- Orbit/POI
- Return-to-Home
- weitere Live-Flight-Control-Kommandos

FH2 V3 implementiert für M4E/M4T aktuell:

```text
ControlCoordinator / DRC-Sitzungsaufbau
Stick-Control
Neutral-Control
Heartbeat
Emergency Stop
FlyTo
```

Nicht implementiert sind in V3:

```text
RTH
Pointing/POI
Orbit
Kamera-/Gimbal-/Payload-Kommandos
```

Diese Funktionen werden daher trotz DJI-Produktsupport nicht als routbare
`AdapterDevice.capabilities[]` gemeldet. Der spezialisierte M4-DRC-Pfad
bleibt zusätzlich FC3/Lease/DJI-Authority/Session/Dead-Man-gated.

## Matrice 4D / 4TD hinter DJI Dock 3

M4D/M4TD verwenden einen eigenen **Dock-to-Cloud**-Vertrag und werden nicht
mit M4E/M4T hinter RC Plus 2 gleichgesetzt.

FH2 erkennt aktuell:

- Dock 3 als Gateway `3/3/0`,
- M4D als Aircraft `0/100/0`,
- M4TD als Aircraft `0/100/1`,
- M4D Camera `98-0-0`,
- M4TD Camera `99-0-0`,
- den offiziellen M4D/M4TD-Property-Vertrag für OSD/State.

Die Integration ist in V3 **Property-/Telemetrie-read-only**. Dokumentierte
`rw`-Properties, Dock-DRC oder andere Steuerfunktionen werden daraus nicht
automatisch freigeschaltet. Es werden keine generischen schreibenden
`AdapterDevice.capabilities[]` beworben.

Siehe [M4D_DOCK3.md](M4D_DOCK3.md).

## M3M

M3M muss getrennt betrachtet werden.

Die aktuelle DJI-Cloud-API-Produktübersicht für den Pilot-to-Cloud-Pfad
enumeriert bei `type=77`:

```text
sub_type 0 = M3E
sub_type 1 = M3T
sub_type 3 = M3TA
```

M3M wird dort nicht als eigener Cloud-Runtime-Produkttyp enumeriert.

Gleichzeitig führt DJI M3M in anderen Verträgen, insbesondere:

- Mobile SDK V5
- WPML / Wayline
- Mapping-/Media-Kontext

Deshalb gilt in FH2:

```text
M3M WPML/Media/MSDK-Support
    !=
automatische Pilot-Cloud-Live-Control-Capability
```

Ohne eindeutige offizielle Cloud-Enumeration beziehungsweise real verifizierte
`update_topo`-Identität erhält M3M **kein** M3E/M3T-Live-Control-Profil.

## Produktsupport versus routbare Capability

FH2 unterscheidet verbindlich:

```text
DJI dokumentiert Produktfunktion
  -> Produkt-Supportprofil

FH2-Adapter kann AircraftCommand tatsächlich ausführen
  -> AdapterDevice.capabilities[]
```

`CapabilityRouter` verwendet `AdapterDevice.capabilities[]`, um einen
Adapter für `AircraftAdapter.execute()` auszuwählen. Deshalb darf dort keine
schreibende DJI-Funktion stehen, solange `DjiCloudAdapter.execute()` sie
nicht tatsächlich erfüllt.

Der M4-ControlCoordinator/DRC-Pfad ist eine spezialisierte Runtime und nutzt
eigene Produkt-/Safety-Guards. Er wird nicht durch eine falsche generische
Adapter-Capability simuliert.

## Telemetrie- und Plattform-Capabilities

DJI-Properties und FH2-Capabilities werden getrennt nach tatsächlich
beobachteter Telemetrie und vollständig implementierter Plattformfunktion
behandelt.

| DJI-Evidenz/Funktion | FH2 V3 | Regel |
| --- | --- | --- |
| Fluglage/Position/Geschwindigkeit | `telemetry.flight` | aus tatsächlich beobachteten Flight-/GNSS-Feldern |
| Battery-Struktur | `telemetry.battery` | aus tatsächlich beobachteter Battery-Telemetrie |
| `cameras` / Kameraeigenschaften | `telemetry.camera` | aus tatsächlich beobachteten Kamera-Properties |
| `gimbal_pitch/roll/yaw` | `telemetry.gimbal` | aus tatsächlich beobachteten Gimbal-Properties |
| `gps_number` | `telemetry.flight` | GPS/GNSS; allein **kein** RTK-Nachweis |
| `rtk_number` | `telemetry.rtk` | RTK-spezifische Telemetrie |
| M4D/M4TD `quality == 10` | `telemetry.rtk` + RTK fixed | im M4D/M4TD-Dock-Property-Vertrag explizit RTK fixed; nicht pauschal auf andere Produktverträge übertragen |
| `mode_code == 18` | `telemetry.rtk` | Airborne RTK fixing; kein Fix-Nachweis |
| `live_capacity` | derzeit **kein** `livestream.read` | DJI-Fähigkeit ist dokumentiert, FH2-Livestream-Integration für V3 noch nicht vollständig implementiert |
| Pilot Media Management | derzeit **kein** `media.read` | DJI-Funktion läuft über Pilot-2/JSBridge/Object-Storage; FH2-Media-Integration bleibt separates Gate |

### GNSS/RTK

DJI trennt GPS- und RTK-Satelliten ausdrücklich. `position_state.is_fixed`
beschreibt den allgemeinen Satelliten-Fixvorgang. Im M4D/M4TD-Dock-Vertrag
ist `position_state.quality=10` ausdrücklich **RTK fixed**; diese Semantik
wird nicht ungeprüft auf andere Produktfamilien übertragen.

FH2 darf deshalb weder aus `gps_number` noch aus `is_fixed==2` allein
eine positive RTK-Capability beziehungsweise einen RTK-Fix ableiten.

### Kamera und Gimbal

Die Telemetrie-Capabilities `telemetry.camera` und
`telemetry.gimbal` sind **beobachtungsbasiert**: Sie werden erst gesetzt,
wenn entsprechende DJI-Properties tatsächlich empfangen wurden.

Das ist unabhängig von den schreibenden Capabilities
`control.camera` und `control.gimbal`.

### Livestream

DJI dokumentiert Pilot-Livestreaming einschließlich `live_capacity` sowie
Start/Stop/Lens-/Quality-Services. FH2 V3 hat diese komplette
Livestream-Verarbeitung noch nicht als Produktfunktion integriert.

Deshalb gilt bis dahin:

```text
DJI live_capacity beobachtet
  !=
FH2 livestream.read freigegeben
```

### Media Management

DJI Pilot 2 unterstützt Media Management über das Media-Modul und
Object-Storage-Upload. Das ist fachlich getrennt von Kamera-Telemetrie und
vom M3M-Media-/NDVI-Datenmodell.

Solange der vollständige FH2-Media-Ingest nicht implementiert und abgenommen
ist, wird `media.read` nicht aus Foto-/Recording-Feldern oder Modellnamen
abgeleitet.

## Wayline-/Missions-Capability

DJI Pilot Wayline Management ist eine eigene Plattformfunktion. Sie verwendet
den Pilot-Mission-/JSBridge-Pfad sowie HTTPS-/Object-Storage-Operationen für
Wayline-Dateien und ist nicht identisch mit einem Aircraft-Telemetriezustand.

Insbesondere gilt:

```text
mode_code == 5
  -> Aircraft befindet sich im Wayline-Flug
  -> telemetry.flight / Missionsbeobachtung

mode_code == 5
  !=
mission.wayline
```

FH2 V3 erkennt und persistiert aktuell Flugsitzungen einschließlich
Wayline-Flugzuständen, implementiert aber keinen vollständigen Pilot-Wayline-
Management-/Execution-Pfad.

Daher wird `mission.wayline` vom DJI-Cloud-Adapter aktuell **nicht** als
routbare `AdapterDevice.capabilities[]`-Capability gemeldet.

UgCS-/WPML-/MSDK-Wayline-Funktionen bleiben davon getrennte Adapter- bzw.
Dateiverträge.

## Kamera-Identitäten

Die im Adapter hinterlegten festen Payload-Identitäten stimmen mit der
aktuellen DJI-Produktübersicht überein:

| Kamera | payload_index |
| --- | --- |
| Mavic 3E | `66-0-0` |
| Mavic 3T | `67-0-0` |
| Mavic 3TA | `129-0-0` |
| Matrice 4E | `88-0-0` |
| Matrice 4T | `89-0-0` |
| Matrice 4D | `98-0-0` |
| Matrice 4TD | `99-0-0` |

Diese Tabelle identifiziert ausschließlich das Payload. Lens-/Video-Pfade
werden weiterhin zur Laufzeit ermittelt.

## Safety-Zuordnung

FH2 V3:

| Capability | Safety |
| --- | --- |
| `control.camera` | nach zentraler Safety-Regel |
| `control.gimbal` | nach zentraler Safety-Regel |
| `payload.control` | nach zentraler Safety-Regel |
| `mission.wayline` | mindestens FC2 |
| `control.flight` | FC3 |
| `control.rth` | FC3 |
| `control.pointing` | FC3 |
| `control.orbit` | FC3 |

Die Tabelle klassifiziert das Safety-Niveau nur für den Fall, dass eine solche
Capability durch einen tatsächlich implementierten Adapterpfad bereitgestellt
wird. Sie bedeutet nicht, dass FH2 V3 alle genannten Capabilities bereits
meldet.

Produktunterstützung hebt die Safety-Stufe niemals automatisch an.

## Noch real zu verifizieren

Vor V3-RC bleiben Hardwaretests erforderlich für:

- reale `update_topo`-Payloads von RC Pro Enterprise
- reale `update_topo`-Payloads von RC Plus 2
- Firmwareabhängigkeiten
- RC-Pro-Client-ID und Reconnect
- Cloud-Control-Authority
- tatsächliche M3E/M3T/M3TA-Payload-Kommandos
- tatsächliche M4E/M4T-Live-Control-Sequenz
- reale Dock-3-`update_topo`-/OSD-/State-Payloads für M4D/M4TD
- M4D/M4TD-`cameras[]`, Batterie-, RTK- und Funklink-Properties

## Offizielle DJI-Referenzen

- Produktunterstützung und Enumerationen:
  https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- Pilot-to-Cloud Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/pilot-feature-set/drc.html
- RC Plus 2 Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/dji-rc-plus-2/drc.html
- RC Pro DRC/Payload:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/rc-pro/drc.html
- M4D/M4TD Dock-to-Cloud Properties:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dock-to-cloud/mqtt/aircraft/m4d-properties.html
- WPML:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html

## Capability-Sicht der Control API

V3 stellt den aktuellen Capability-Zustand pro Gerät read-only bereit:

```http
GET /api/devices/{device_sn}/capabilities
```

Die Antwort trennt drei Ebenen:

### 1. Adapter-Capabilities

`AdapterDevice.capabilities[]` enthält nur Fähigkeiten, die der jeweilige
Adapter tatsächlich meldet. Dazu gehören beobachtungsbasierte
Telemetrie-Capabilities und nur dann schreibende Capabilities, wenn
`AircraftAdapter.execute()` sie wirklich bedienen kann.

### 2. DJI-Produkt-/Control-Profil

`controlProfile` beschreibt den bekannten DJI-Produktsupport hinter dem
erkannten Gateway. Dazu gehören beispielsweise `flightControl`, `flyTo`,
`pointingFlight`, `orbitFlight`, `payloadControl`, `drcProfile` und
`requiresCloudControlAuthority`.

Diese Werte beschreiben Produktsupport beziehungsweise spezialisierte
Runtime-Pfade. Sie werden nicht automatisch in generische
`AdapterDevice.capabilities[]` übertragen.

### 3. Mission-/Wayline-Evidenz

Die Capability-Sicht zeigt zusätzlich:

```text
observedInActiveMission
observedInLastCompletedMission
currentlyFlyingWayline
executionCapabilityAdvertised
managementImplemented
```

Damit kann die Oberfläche korrekt darstellen, dass das Aircraft gerade eine
Wayline fliegt, ohne daraus fälschlich abzuleiten, dass FH2 Waylines
hochladen oder starten darf.

Für den aktuellen V3-DJI-Cloud-Adapter gilt weiterhin:

```text
mode_code == 5
  -> Wayline-Telemetrieevidenz

mission.wayline
  -> nicht beworben
```
