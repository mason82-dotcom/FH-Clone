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

### Aircraft im aktuellen Pilot-to-Cloud-Profil

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| Mavic 3 Enterprise | 0 | 77 | 0 |
| Mavic 3 Thermal | 0 | 77 | 1 |
| Mavic 3 Multispectral | 0 | 77 | 2 |
| Mavic 3TA | 0 | 77 | 3 |
| Matrice 4E | 0 | 99 | 0 |
| Matrice 4T | 0 | 99 | 1 |

Unbekannte Domains oder Subtypen werden **fail-closed** behandelt.

## Globale Ausschlüsse

Unabhängig von DJI-Produktsupport und Capability-Erkennung gilt:

```text
DJI Dock domain=3
  -> global disabled

Multi-Dock
  -> global disabled

PSDK-specific services/telemetry
  -> global disabled
```

Damit sind DJI Dock 1, Dock 2 und Dock 3 einschließlich ihrer Sub-Devices
keine aktiven FH2-Runtime-Gateways. Multi-Dock-Felder und -Services werden
verworfen beziehungsweise abgelehnt. PSDK-spezifische Methoden
(`psdk_*`, `drc_psdk_*`) und PSDK-Telemetriefelder werden ebenfalls
gesperrt.

Diese Policy betrifft **nicht** die eingebauten DJI-Kamera-Payloads
(M3E/M3T/M3TA/M4E/M4T) mit ihren dokumentierten `payload_index`-Werten.

Es gibt keinen Environment- oder Runtime-Schalter zur Reaktivierung.

## Live-Control-Matrix

| Funktion | M3E/M3T/M3TA + RC Pro Enterprise | M4E/M4T + RC Plus 2 | FH2 V3 Runtime |
| --- | --- | --- | --- |
| Kamera-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `control.camera`-Werbung |
| Gimbal-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `control.gimbal`-Werbung |
| Payload-Steuerung | DJI dokumentiert | DJI dokumentiert | noch kein ausführbarer FH2-Pfad; **keine** `payload.control`-Werbung |
| Cloud-Control-Authority | DJI Pilot-to-Cloud | DJI dokumentiert | M3 + RC Pro und M4 + RC Plus 2: an; Consent/State muss positiv bestätigt sein |
| Stick-Control | für M3/RC Pro nicht verwendet | DJI dokumentiert | M3: aus; M4 + RC Plus 2: an, FC3/Lease/Authority/Session/Dead-Man-gated |
| `drone_control` | **keine Cloud-Flugsteuerung** | DJI dokumentiert | M3: aus; M4 + RC Plus 2: an, FC3/Lease/Authority/Session/Dead-Man-gated |
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

DJI grenzt die Mavic-3-Enterprise-Serie im Pilot-to-Cloud-Pfad auf
Cloud-Payload-Control ein. Cloud-Flugsteuerung ist dort nicht unterstützt;
die Fernsteuerung kann während des Cloud-Payload-Control weiter manuell
geflogen werden.

FH2 aktiviert hinter RC Pro Enterprise daher:

```text
cloudControl   = true
flightControl  = false
stickControl   = false
droneControl   = false
payloadControl = true
DrcProfile     = none
FlyTo          = false
```

Die spezialisierten Runtime-Fähigkeiten werden nicht automatisch als
generische `AircraftAdapter.execute()`-Capabilities ausgegeben.

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

FH2 trennt für M4E/M4T die beiden DRC-Steuerpfade ausdrücklich:

```text
Cloud-Control / cloud_control = ENABLED (M4 + RC Plus 2)
Stick-Control / stick_control = ENABLED (M4 + RC Plus 2)
drone_control                 = ENABLED (M4 + RC Plus 2)
DrcProfile                    = pilot-m4-stick
cloudControl                  = true
flightControl                 = true
droneControl                  = true

FlyTo                         = separat verfügbar, sofern freigegeben
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

## M3M

M3M muss getrennt betrachtet werden.

Für die konkrete FH2-Hardwarekombination wurde M3M auf realer
RC-Pro-Enterprise-/Pilot-2-Hardware im Cloud-`update_topo` wie folgt
beobachtet:

```text
domain   = 0
type     = 77
sub_type = 2
```

Damit ist `0/77/2` für FH2 als reale M3M-Cloud-Produktidentität bestätigt.

DJI führt M3M außerdem in Mobile SDK V5, WPML/Wayline und
Mapping-/Media-Kontexten. Die bestätigte Cloud-Produktidentität bedeutet
jedoch nicht automatisch, dass FH2 das M3E/M3T-Control-Profil übernehmen darf.

```text
M3M Cloud-Identität 0/77/2
    !=
automatische Pilot-Cloud-Live-Control-Capability
```

M3M bleibt für Cloud-Control und Payload-Control fail-closed, bis der konkrete
Payload-/Authority-/Reply-Vertrag auf realer Hardware separat qualifiziert
wurde. Die MSDK-V5-Relation darf weiterhin ergänzend für die read-only
Geräteansicht verwendet werden; sie erzeugt keine Control-Freigabe.

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
| M3-Serie: `position_state.is_fixed == 2` | `telemetry.rtk` + RTK fixed | real für M3E/M3M beobachteter M3-Vertrag; `quality` wird nicht familienübergreifend gleichgesetzt |
| `mode_code == 18` | `telemetry.rtk` | Airborne RTK fixing; kein Fix-Nachweis |
| `live_capacity` | **kein** `livestream.read` | FlightHub-2-/SIKONG-CE-Bezahlstreaming ist für V3 ausdrücklich deaktiviert; Herstellerfähigkeit allein schaltet nichts frei |
| Pilot Media Management | derzeit **kein** `media.read` | DJI-Funktion läuft über Pilot-2/JSBridge/Object-Storage; FH2-Media-Integration bleibt separates Gate |

### GNSS/RTK

DJI trennt GPS- und RTK-Satelliten ausdrücklich. Die konkrete Bedeutung der
Statusfelder ist produktfamilienabhängig und darf nicht aus einer anderen
DJI-Produktfamilie übertragen werden.

Für die M3-Serie verwendet FH2 den real verifizierten Vertrag
`position_state.is_fixed == 2` als Fixed-Zustand. Sowohl der vorhandene
M3E-Capture als auch die reale M3M-Telemetrie zeigen dabei `quality=5`;
FH2 verlangt deshalb für M3 ausdrücklich **nicht** `quality == 10`.
`gps_number` allein bleibt kein RTK-Nachweis.

### Kamera und Gimbal

Die Telemetrie-Capabilities `telemetry.camera` und
`telemetry.gimbal` sind **beobachtungsbasiert**: Sie werden erst gesetzt,
wenn entsprechende DJI-Properties tatsächlich empfangen wurden.

Das ist unabhängig von den schreibenden Capabilities
`control.camera` und `control.gimbal`.

### Livestream

DJI dokumentiert Pilot-Livestreaming einschließlich `live_capacity` sowie
Start/Stop/Lens-/Quality-Services.

Für FH2 V3 gilt jedoch ausdrücklich:

```text
DJI live_capacity beobachtet
  !=
FH2 livestream.read freigegeben

FlightHub-2 / SIKONG CE paid livestream
  = DISABLED
```

Der kostenpflichtige FlightHub-2-/SIKONG-CE-Pfad wird nicht implementiert,
nicht automatisch aktiviert und nicht aus Hersteller-Capabilities abgeleitet.

Der stattdessen verbindliche FH2-Zielpfad ist:

```text
DJI Cloud API / Pilot 2
  -> RTMP
  -> eigener MediaMTX
  -> WebRTC
  -> FH2 WebUI
```

`live_capacity` wird dabei ausschließlich als Runtime-Evidenz für verfügbare
Videoquellen verwendet. `livestream.read` bleibt bis zur vollständig
implementierten und real getesteten End-to-End-Kette weiterhin **nicht
beworben**.

Details: [LIVESTREAM.md](LIVESTREAM.md).

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
| Mavic 3M | `68-0-0` |
| Mavic 3TA | `129-0-0` |
| Matrice 4E | `88-0-0` |
| Matrice 4T | `89-0-0` |

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

## Offizielle DJI-Referenzen

- Produktunterstützung und Enumerationen:
  https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- Pilot-to-Cloud Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/pilot-feature-set/drc.html
- RC Plus 2 Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/dji-rc-plus-2/drc.html
- RC Pro DRC/Payload:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/rc-pro/drc.html
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
erkannten Gateway. Dazu gehören beispielsweise `cloudControl`,
`flightControl`, `flyTo`,
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
