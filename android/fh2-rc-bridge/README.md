# FH2 RC Bridge

Native Android-App für DJI-Fernsteuerungen auf Basis des DJI Mobile SDK V5.

## Aktueller Stand

Baseline:

- DJI MSDK `5.18.0`
- Android minSdk 24
- compileSdk 36
- targetSdk 35 (DJI-MSDK-5.18-Kompatibilitätsgrenze)
- Android Build Tools 36.0.0
- AGP 8.13.2
- Gradle 8.13
- Kotlin 2.3.21
- arm64-v8a
- Ziel zuerst: M3E / M3T / M3TA + DJI RC Pro Enterprise

Implementiert:

- MSDK-Initialisierung und Registrierung
- Product Connect / Disconnect Status
- getrennte Gateway-/Aircraft-Identität
- RC-SN + RC-Firmware über RemoteControllerKey
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
- lokaler Hardware-Evidence-Export in den App-Dateibereich
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
- noch kein FH2-Control-WebSocket
- Pairing + read-only Snapshot-Heartbeat sind implementiert
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
gateway
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


## Hardware Evidence

Über **Hardware-Evidence speichern** erzeugt die App lokal:

```text
Android/data/com.fh2.rcbridge/files/evidence/
  fh2-msdk-evidence-<timestamp>.json
```

Enthalten ist der aktuelle MSDK-/Aircraft-/Sensor-/RTK-/Control-Snapshot.
Der DJI-App-Key und andere lokale Secrets werden nicht exportiert.

Diese Datei dient als reale RC-Pro/M3-Hardware-Fixture und wird nicht
automatisch hochgeladen.


## FH2 Pairing

Die App kann sich über die Control API read-only pairen:

```text
POST /api/msdk/pair
POST /api/msdk/heartbeat
```

Ablauf:

```text
manuell eingegebener MSDK_PAIRING_TOKEN
  -> /api/msdk/pair
  -> HMAC-signiertes Agent-Token
  -> 1 Hz /api/msdk/heartbeat
  -> fh2.msdk.v1 BridgeSnapshot
```

Der Pairing-Token wird nicht gespeichert. Das Agent-Token bleibt in diesem
Entwicklungsstand ausschließlich im Prozessspeicher und geht beim App-Neustart
verloren.

Release-Builds akzeptieren nur HTTPS. Der Debug-Build erlaubt HTTP
ausschließlich für localhost beziehungsweise private RFC1918-LAN-Adressen.

Der Pairing-/Heartbeat-Kanal besitzt keinerlei Flight-Control-Command-
Nachrichten.


## Android API 36

Der Branch verwendet jetzt:

```text
compileSdk = 36
targetSdk  = 35
AGP        = 8.13.2
Kotlin     = 2.3.21
BuildTools = 36.0.0
Core-KTX   = 1.17.0
AppCompat  = 1.8.0
DJI MSDK   = 5.18.0
```

`compileSdk 36` ist mit AGP 8.13.x unterstützt. `targetSdk 36` bleibt
vorerst bewusst deaktiviert, weil DJI MSDK 5.18.0 Android 16 / API 36 noch
nicht offiziell als unterstütztes Target bestätigt.

`androidx.core:core-ktx` bleibt bei 1.17.0. Ab Core 1.18.0 wurde die
Compile-Basis auf API 36.1 angehoben; das würde für diese RC-App derzeit nur
Tooling-Komplexität hinzufügen, ohne einen MSDK-Vorteil zu bringen.

Für den Build werden **JDK 17** und **Gradle 8.13** benötigt. Der erzeugte
App-Bytecode bleibt absichtlich auf Java/Kotlin JVM 1.8, solange DJI MSDK
hierfür keinen höheren Bytecode-Level verlangt.

Der Repository-Branch enthält aktuell bewusst keinen generierten
`gradle-wrapper.jar`. Wird ein Wrapper benötigt, im Android-Projekt einmal
lokal ausführen:

```bash
gradle wrapper --gradle-version 8.13
```

Danach kann regulär mit `./gradlew :app:assembleDebug` gebaut werden.
