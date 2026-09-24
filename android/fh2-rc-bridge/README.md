# FH2 RC Bridge

Native Android-App für DJI-Fernsteuerungen auf Basis des DJI Mobile SDK V5.

## Aktueller Stand

Baseline:

- DJI MSDK `5.18.0`
- Android minSdk 24
- compileSdk 35
- targetSdk 35 (DJI-MSDK-5.18-Kompatibilitätsgrenze)
- Android Build Tools 35.0.0
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
- Live-Karte auf MapLibre 10.3.5
- Aircraft-, Home-, RC-Pro- und RTK-Marker
- Live-Flugspur + Aircraft-Follow
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
- kein öffentlicher Operator-/Browser-Schreibendpunkt für Flight-Control
- keine automatische FC3-/Lease-Erteilung
- Pairing + read-only Snapshot-Heartbeat sind implementiert
- der authentifizierte Agent-Control-WebSocket ist implementiert
- Kamera/Gimbal/RTK, Wayline, Livevideo und Medienbrowser sind lokal vorhanden

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

## Transportarchitektur

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
keyManager
capabilities
```

Die Capability-Ableitung verwendet ausschließlich von MSDK gemeldete
CameraType-/Component-Werte. Es wird nicht aus frei formulierten Produktnamen
oder Android-Gerätenamen geraten.


### KeyManager-Runtime

`keyManager.keys[]` enthält das konkrete MSDK-Key-Inventar der laufenden
Android-Bridge. Pro Key werden unter anderem exportiert:

```text
identifier
family
componentIndex
cameraLensType
canGet / canSet / canListen / canPerformAction
probeMode
runtimeStatus
valueType
lastObservedAt
lastError
```

Die Runtime verwendet `KeyTools`, liest Cache-/Hardwarewerte nur read-only und
bindet Listener an einen eigenen Holder. Bei Disconnect, Refresh oder Stop
werden diese Listener über `cancelListen(holder)` beendet.

`canSet=true` und `canPerformAction=true` sind ausschließlich
Operationsmetadaten des DJI-Keys. Daraus entsteht weder automatisch
`control.camera` noch `control.gimbal` oder `control.flight`.

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

Enthalten sind:

- der aktuelle MSDK-/Aircraft-/Sensor-/RTK-/Control-Snapshot
- das aktuelle KeyManager-Runtimeinventar inklusive Component-/Lens-Kontext
- der aktuelle FH2-Bridge-Zustand
- der aktuelle Agent-Control-WebSocket-Zustand
- ein auf 256 Einträge begrenzter Pairing-/Transport-Trace seit App-Start
- Marker für Pairing-Annahme, Stored-Pairing-Resume, Unpair-Widerruf und
  fehlgeschlagenen Widerruf

Der Transport-Trace enthält **keinen** `MSDK_PAIRING_TOKEN`, keinen
Agent-Bearer-Token und keinen DJI-App-Key. Fehlermeldungen werden auf 256
Zeichen begrenzt und eventuell enthaltene `Bearer ...`-Werte redigiert.

Die Root-Struktur bleibt `fh2.msdk.v1`; die zusätzlichen Nachweise liegen
unter:

```text
evidence.schema = fh2.pairing-transport-evidence.v1
evidence.bridge
evidence.controlChannel
evidence.events[]
```

Diese Datei dient als reale RC-Pro/M3-Hardware-Fixture und wird nicht
automatisch hochgeladen.


Für die KeyManager-Hardwareabnahme:

```bash
node scripts/verify-msdk-evidence.mjs --keymanager fh2-msdk-evidence-<timestamp>.json
```

Die zentrale Hardware-Evidence erwartet für die produktbezogene Freigabe
zusätzlich einen redigierten realen Capture. Synthetische Key-Inventare zählen
nicht als Hardwarebeleg.


## FH2 Pairing

Die App kann sich über die Control API read-only pairen:

```text
POST /api/msdk/pair
POST /api/msdk/heartbeat
POST /api/msdk/unpair
```

Ablauf:

```text
manuell eingegebener MSDK_PAIRING_TOKEN
  -> /api/msdk/pair
  -> HMAC-signiertes Agent-Token
  -> 1 Hz /api/msdk/heartbeat
  -> fh2.msdk.v1 BridgeSnapshot
```

Der Bootstrap-Pairing-Token wird **nie** gespeichert.

Das vom Backend ausgestellte Agent-Token wird dagegen verschlüsselt mit
Android Keystore (`AES/GCM`) gespeichert. Der Klartext liegt weder in
SharedPreferences noch in einer Datei.

Automatisches Resume erfolgt nur, wenn nach dem App-Neustart gleichzeitig:

```text
MSDK registriert
+ DJI-Produkt verbunden
+ RC-SN == gespeicherte gatewaySn
+ Flight-Controller-SN == gespeicherte aircraftSn
+ Agent-Token noch nicht abgelaufen
```

gelten. Bei anderer RC/Aircraft-Kombination bleibt der gespeicherte Pairing-
Datensatz fail-closed. Bei `401/403`, Tokenablauf oder explizitem Trennen wird
er gelöscht.

Release-Builds akzeptieren nur HTTPS. Der Debug-Build erlaubt HTTP
ausschließlich für localhost beziehungsweise private RFC1918-LAN-Adressen.

Explizites Trennen ist ein echtes Unpair: Die App beendet zuerst den lokalen
Control-Transport fail-closed und ruft danach `POST /api/msdk/unpair` mit dem
Agent-Token auf. FH2 persistiert ausschließlich den SHA-256-Digest des
widerrufenen Tokens bis zu dessen Ablauf und lehnt ihn danach auch nach einem
Control-API-Neustart ab. Der rohe Bearer-Token wird serverseitig nicht
persistiert.

Scheitert der serverseitige Widerruf wegen Netzwerk- oder Serverfehler, bleibt
der verschlüsselte Pairing-Datensatz lokal erhalten und der Zustand wird als
`unpair_failed` angezeigt, damit der Widerruf erneut versucht werden kann.
Ein bereits ungültiges beziehungsweise abgelaufenes Token (`401/403`) gilt
lokal als abgeschlossenes Unpair.

Der Pairing-/Heartbeat-Kanal besitzt keinerlei Flight-Control-Command-
Nachrichten.


## MSDK Control WebSocket

Nach erfolgreichem Pairing verbindet die Android-App zusätzlich:

```text
WSS /ws/msdk/control/{aircraftSn}
Authorization: Bearer <agentToken>
```

Der Agent-Token ist an genau `gatewaySn + aircraftSn` gebunden. Ein Socket
allein erzeugt **keine** Flugsteuerungsberechtigung.

Der Backend-`MsdkControlHub` öffnet eine Control-Session nur, wenn gleichzeitig
erfüllt ist:

```text
Agent frisch (Heartbeat <= 3 s)
+ lokale Android-Freigabe (NetworkControlArm)
+ MSDK virtualStick Capability
+ FC3
+ Control Lease für denselben Holder
+ verbundener authentifizierter Agent-Socket
```

Protokoll:

```text
Server -> Agent: session_start
Agent  -> Server: session_ready | session_rejected
Server -> Agent: stick
Server -> Agent: neutral
Server -> Agent: session_stop
Agent  -> Server: session_stopped
```

Stickframes sind normalisiert auf `[-1,1]`, besitzen eine serverseitige
monotone Sequenznummer und verfallen nach 250 ms.

Die App akzeptiert `session_start` nur bei lokaler Netzwerkfreigabe. Sie
fordert dann MSDK Virtual Stick an und bestätigt `session_ready` erst,
wenn `authorityOwner == MSDK` gemeldet wird.

Transport-Lifecycle:

- ein gültiges HMAC-Agent-Token darf den WSS-Transport nach einem
  Control-API-Prozessneustart erneut authentisieren; eine Control-Session bleibt
  trotzdem gesperrt, bis wieder ein frischer Snapshot-Heartbeat vorliegt
- nach einem transienten WSS-Abbruch versucht die Android-App den Control-Kanal
  nur nach erfolgreichem Heartbeat erneut aufzubauen, mit 3 s Mindestabstand
- Tokenablauf schließt den Backend-Socket mit Code `4003` und beendet eine
  aktive Session vorher mit `neutral` + `session_stop`
- ein ersetzter Agent-Socket beendet eine laufende Session ebenfalls zuerst
  fail-closed; eine neue Verbindung übernimmt niemals eine alte Session

Fail-closed:

- lokales Disarm -> Neutral + Authority release
- Socketverlust -> Neutral + Authority release
- FC3-/Lease-Verlust -> Backend sendet zuerst `neutral`, dann
  `session_stop`
- Agent-Heartbeat > 3 s alt -> Session close
- lokale Input-Stille 500 ms -> Neutral
- lokale Input-Stille 2 s -> Neutral + Virtual Stick release

Derzeit existiert bewusst **kein öffentlicher Operator-Ingress**, der
`openSession()` oder `sendStick()` aufruft. Damit ist der Agent-Kanal
vollständig implementiert und testbar, kann aber nicht durch einen
unautorisierten Browser-/HTTP-Aufruf aktiviert werden.


## Pairing-/Transport-Hardwareabnahme

Für die reale RC-Pro-Abnahme ist pro Prozesslauf nach einem relevanten Schritt
**Hardware-/Transport-Evidence speichern** auszuführen.

Verbindliche Sequenz:

```text
1. App frisch starten, DJI-Produkt verbinden
2. Pairing durchführen
3. Heartbeat + Control-WSS als verbunden beobachten
4. Control API neu starten
5. WSS-Reconnect + erneuten Heartbeat beobachten
6. Android-App vollständig beenden und neu starten
7. Stored Pairing muss bei gleicher RC-/Aircraft-Identität automatisch resümieren
8. FH2 Verbindung trennen / Unpair
9. App erneut starten
10. kein Stored-Pairing-Resume mehr
```

Erwartete Evidence-Marker beziehungsweise Zustände:

```text
pairing_accepted
heartbeat_established
control: connected
... Transportverlust ...
control: connected            # neuer Socket, keine alte Control-Session
stored_pairing_resumed        # nach App-Neustart
unpair_revocation_accepted
pairing_cleared_local
bridge: disconnected          # nach Unpair
```

Fail-Kriterien:

- nach Control-API-Neustart wird eine alte Control-Session übernommen
- nach App-Neustart stimmen gespeicherte und aktuelle RC-/Aircraft-SN nicht
  überein und Resume erfolgt trotzdem
- Unpair löscht lokal trotz serverseitigem Netzwerk-/Serverfehler den Token
- nach erfolgreichem Unpair entsteht ohne neues Pairing erneut ein
  `paired`-/`stored_pairing_resumed`-Zustand
- Evidence enthält Pairing-/Bearer-/DJI-App-Secrets

Der serverseitige Nachweis, dass ein widerrufener alter Agent-Token mit
`401` abgewiesen wird, bleibt zusätzlich durch die automatisierten
Revocation-Tests belegt; der reale RC-Test muss dafür keinen Bearer-Token
offenlegen oder exportieren.

Die exportierten Dateien können aus dem Repository-Root automatisch geprüft
werden:

```bash
npm run verify:msdk-evidence -- fh2-msdk-evidence-*.json
```

Für die vollständige Pairing-/Transport-Abnahme über mehrere Prozessläufe:

```bash
npm run verify:msdk-evidence -- --acceptance \
  pair-reconnect.json \
  app-restart.json \
  unpair.json
```

Der Acceptance-Modus verlangt die Pflichtmarker, mindestens zwei
`control: connected`-Transitions in einem Prozesslauf als
Control-API-Reconnect-Nachweis sowie einen abgeschlossenen Unpair-Zustand.
Zusätzlich wird rekursiv auf verbotene Secret-Felder und nicht redigierte
`Bearer ...`-Werte geprüft.


## Android API 35 / DJI MSDK 5.18

Der Branch verwendet jetzt:

```text
compileSdk = 35
targetSdk  = 35
AGP        = 8.13.2
Kotlin     = 2.3.21
BuildTools = 35.0.0
Core-KTX   = 1.16.0
AppCompat  = 1.7.1
DJI MSDK   = 5.18.0
```

`compileSdk 35` und `targetSdk 35` bilden die aktuell in CI und im
DJI-MSDK-5.18-Runtimepfad validierte Baseline. Eine Anhebung auf API 36 wird
erst nach separater MSDK-/Hardwarevalidierung vorgenommen.

`androidx.core:core-ktx` bleibt bei 1.16.0 und `appcompat` bei 1.7.1. Diese
Versionen sind Teil derselben API-35-Baseline und werden gemeinsam mit dem
Android-Buildvertrag aktualisiert.

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


## Kartenfunktion

Die RC-App besitzt eine eigene Live-Karte auf **MapLibre 10.3.5**. Diese
Version entspricht der MapLibre-Basis im offiziellen DJI-V5-UXSDK-Sample.

Dargestellt werden ausschließlich reale MSDK-Werte:

```text
Aircraft  <- FlightControllerKey.KeyAircraftLocation3D
Home      <- FlightControllerKey.KeyHomeLocation
RC Pro    <- RemoteControllerKey.KeyRcGPSInfo
RTK       <- RTKCenter / RTKLocationInfo
Flugspur  <- laufende Aircraft-Position
Heading   <- FlightControllerKey.KeyCompassHeading
```

Funktionen:

- Aircraft-Marker
- Home-Marker
- RC-Pro-GPS-Marker
- RTK-Mobile-Station-Marker
- Live-Flugspur
- Aircraft-Follow an/aus
- Flugspur löschen
- vollständiger MapView-Lifecycle

Der Kartenstil ist konfigurierbar. Standard für Entwicklung:

```properties
FH2_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json
```

Für Produktion kann in `~/.gradle/gradle.properties` ein eigener
HTTPS-Style-/Tile-Server gesetzt werden:

```properties
FH2_MAP_STYLE_URL=https://maps.example.local/styles/fh2/style.json
```

Die App bleibt bei `android:usesCleartextTraffic="false"`; produktive
Kartenquellen sollen daher HTTPS verwenden.

### Geplante Kartenlayer

Die Struktur ist vorbereitet für:

- Wayline/Missionsroute
- UgCS-Routen
- Thermal-Capture-Punkte
- Multispektral-/NDVI-Captures
- Geofences/FlySafe
- spätere FH2-Backend-Overlays

Die Karte berechnet keine erfundenen Positionen oder Footprints. Fehlt ein
MSDK-/Backend-Datensatz, wird der entsprechende Layer nicht gezeichnet.


## Livevideo

Die App verwendet den aktuellen MSDK-V5-`CameraStreamManager` und bindet den
DJI-Videostream direkt an eine lokale Android-`Surface`.

Der Screen **Livevideo öffnen** unterstützt die von MSDK für die gewählte
Kamera gemeldeten Streamquellen, darunter je nach Aircraft/Sensor:

```text
WIDE_CAMERA
ZOOM_CAMERA
INFRARED_CAMERA
RGB_CAMERA
NDVI_CAMERA
MS_G_CAMERA
MS_R_CAMERA
MS_RE_CAMERA
MS_NIR_CAMERA
```

Die Quelle wird ausschließlich aus
`CameraKey.KeyCameraVideoStreamSourceRange` angeboten. Eine Thermal- oder
Multispektralquelle wird nicht anhand des Modellnamens erfunden.

Das Video bleibt aktuell lokal auf der RC. Es wird weder automatisch ins FH2-
Backend gestreamt noch als versteckter RTSP/WebRTC-Pfad veröffentlicht.

## Wayline / WPML

Die App kann eine DJI-WPML-KMZ lokal auswählen, die darin verfügbaren
Wayline-IDs über `WaypointMissionManager.getAvailableWaylineIDs()` lesen und
die KMZ mit `pushKMZFileToAircraft()` auf die Aircraft übertragen.

Ein Missionsstart ist bewusst **nicht** an Pairing/Heartbeat gekoppelt und wird
derzeit nicht automatisch ausgelöst.


## Medienbrowser

**Medien öffnen** aktiviert den DJI `MediaManager` nur für die Dauer des
Media-Screens. Die Dateiliste wird explizit von der ausgewählten Hauptkamera
geladen.

Ein Tap auf einen Eintrag lädt die Originaldatei manuell in:

```text
Android/data/com.fh2.rcbridge/files/media/
```

Es gibt keinen automatischen Media-Sync und keinen automatischen Upload zum
FH2-Backend. Beim Verlassen des Screens werden laufende Pulls beendet und der
MediaManager wieder deaktiviert.


## CI-APK

Der Workflow **Android MSDK Validation** erzeugt nach erfolgreichem
`assembleDebug` + `lintDebug` ein Hardware-Test-Artefakt:

```text
fh2-rc-bridge-debug.apk
fh2-rc-bridge-debug.apk.sha256
BUILD_INFO.txt
```

`BUILD_INFO.txt` enthält Commit, MSDK-Version, Application-ID, SHA-256 und
nur die Information, ob ein DJI-App-Key beim Build konfiguriert war.

Ein DJI-App-Key wird niemals in das Artefakt-Metadatenfile geschrieben.

Optionales GitHub-Secret:

```text
DJI_MSDK_APP_KEY
```

Ist es vorhanden, wird es ausschließlich für den Gradle-Build nach
`~/.gradle/gradle.properties` injiziert. Fehlt es, bleibt das APK ein
Compile-/UI-Testbuild und kann sich bei DJI nicht erfolgreich registrieren.

Installation auf einer für Drittanbieter-Apps freigegebenen RC per ADB:

```bash
adb install -r fh2-rc-bridge-debug.apk
```

Vor dem Hardwaretest die SHA-256 aus
`fh2-rc-bridge-debug.apk.sha256` gegen das APK prüfen.
