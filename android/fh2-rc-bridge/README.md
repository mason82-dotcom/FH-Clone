# FH2 RC Bridge

Native Android-App für DJI-Fernsteuerungen auf Basis des DJI Mobile SDK V5.

## Aktueller Stand

Baseline:

- DJI MSDK `5.18.0`
- Android minSdk 24
- compile/targetSdk 35
- arm64-v8a
- Ziel zuerst: M3E / M3T / M3TA + DJI RC Pro Enterprise

Implementiert:

- MSDK-Initialisierung und Registrierung
- Product Connect / Disconnect Status
- authoritative MSDK-Geräteidentität über ProductKey
- Product Type, Firmware, Flight-Controller-SN
- Aircraft Location 3D (raw MSDK)
- Camera-/Gimbal-Inventar je ComponentIndex
- CameraType + Camera Serial
- verfügbare Video-/Lens-Source-Enums
- Payload-Port-Verbindungen + ProductName
- RTKCenter System State und RTK-Location
- RTK Solution, Source, Standardabweichungen und Satellitenzahlen
- kanonischer FH2 BridgeSnapshot als JSON
- Capability-Ableitung nur aus MSDK CameraType/Component-State
- Virtual-Stick-State und Flight-Control-Authority
- explizites Enable / Disable
- normalisierte Stick-Eingabe `[-1, 1]`
- Neutralisierung
- lokaler Dead-Man:
  - 500 ms ohne Eingabe -> Neutral
  - 2 s ohne Eingabe -> Neutral + Virtual Stick freigeben

Nicht implementiert:

- keine automatische Flight-Control-Aktivierung
- noch kein FH2-WebSocket
- noch keine Backend-Pairing-Credentials
- noch keine Remote-Control-Freigabe aus dem Netzwerk
- Kamera/Gimbal/RTK/Wayline folgen separat

## DJI App Key

Ein echter DJI-App-Key wird **nicht** im Repository gespeichert.

In `~/.gradle/gradle.properties`:

```properties
AIRCRAFT_API_KEY=DEIN_DJI_APP_KEY
```

Die Application-ID lautet:

```text
com.fh2.rcbridge
```

Der DJI Developer Center App Key muss zu dieser Application-ID passen.

## RC Pro Enterprise

Bei der Mavic-3-Enterprise-Serie ist die MSDK-App ein eigener Betriebsmodus.
DJI Pilot 2 und die Drittanbieter-MSDK-App sollen nicht gleichzeitig um die
Geräte-/Flight-Control-Schnittstellen konkurrieren.

## Safety

Die Android-App startet immer ohne Virtual-Stick-Control.

Eine spätere FH2-Netzwerksteuerung darf nur aktiv werden, wenn zusätzlich
Backend-seitig mindestens erfüllt sind:

```text
FC3
+ gültiger Control Lease
+ passende MSDK-Capability
+ aktive Android-Control-Session
+ lokaler Dead-Man
```

MSDK-Authority ersetzt den FH2-Control-Lease nicht.

## Geplante Transportarchitektur

```text
RC Pro Enterprise
   |
DJI MSDK V5
   |
FH2 RC Bridge
   |
HTTPS / WSS
   |
FH2 Control API
   |
SafetyGate + Control Lease
```

Ein eigener Android-Schatten-Backendpfad wird nicht eingeführt.


## BridgeSnapshot

Die App bündelt den lokalen MSDK-Zustand in einen stabilen Snapshot:

```text
schema = fh2.msdk.v1
sdk
aircraft
sensors[]
rtk
control
capabilities
```

Die Capability-Ableitung verwendet ausschließlich von MSDK gemeldete
CameraType-/Component-Werte. Es wird nicht aus frei formulierten Produktnamen
oder Android-Gerätenamen geraten.

Beispiele:

- `CameraType.M3T` -> thermal
- `CameraType.M3M` -> multispectral
- verbundener Gimbal -> gimbal
- RTK-Systemzustand vorhanden -> rtk

Der JSON-Snapshot ist die Grundlage für das spätere HTTPS/WSS-Pairing mit der
FH2 Control API.
