# DJI Pilot 2 JSBridge

## Zweck

FH2 unterstützt die offizielle DJI-Pilot-2-WebView-Schnittstelle
`window.djiBridge`.

Diese Runtime ist fachlich und technisch getrennt von:

```text
window.FH2
  -> FlightHub-2-On-Premises-Standalone-Komponenten

window.djiBridge
  -> DJI Pilot 2 WebView / Pilot-to-Cloud
```

Die JSBridge ist nur verfügbar, wenn die FH2-Weboberfläche innerhalb des
DJI-Pilot-2-WebViews geöffnet wird. In einem normalen Desktop-Browser bleibt
der Bridge-Status `unavailable`, ohne den übrigen Webbetrieb zu blockieren.

## Initialisierung

FH2 initialisiert die Bridge in dieser Reihenfolge:

```text
window.djiBridge vorhanden?
  -> platformIsVerified()
  -> optional platformVerifyLicense(appId, appKey, license)
  -> platformSetWorkspaceId(uuid)
  -> platformSetInformation(platformName, workspaceName, description)
  -> Controller-/Aircraft-SN lesen
```

DJI verlangt die License-Verifikation vor nachfolgenden JSBridge-Aufrufen.
Der Workspace-ID-Vertrag erwartet UUID-Format.

FH2 verwendet dafür den React-Provider:

```text
apps/web/src/pilot-bridge/DjiPilotBridgeProvider.tsx
```

und den typisierten Adapter:

```text
apps/web/src/pilot-bridge/client.ts
```

## Unterstützte Bridge-Primitive

Der Adapter bildet die von DJI dokumentierten Grundfunktionen ab:

- `platformGetVersion`
- `platformIsVerified`
- `platformVerifyLicense`
- `platformSetWorkspaceId`
- `platformSetInformation`
- `platformGetRemoteControllerSN`
- `platformGetAircraftSN`
- `platformLoadComponent`
- `platformUnloadComponent`
- `platformIsComponentLoaded`
- API-Token lesen/setzen
- API-Host lesen
- Thing-Verbindungsstatus / Connect / Disconnect / Callback
- WebSocket-Verbindungsstatus / Connect / Disconnect / Send
- Map-Username und Elementpräfix
- Media-Auto-Upload/Download-Owner lesen und setzen
- App-Installation prüfen
- Pilot-Log-Pfad und Log-Encrypt-Key
- Pilot-Plattform schließen

Zusätzlich existieren typisierte Loader für:

```text
thing
liveshare
api
ws
map
tsa
media
mission
```

## Modulabhängigkeiten

FH2 lädt absichtlich **kein** Modul automatisch mit geratenen Parametern.

### thing

Das Cloud-Modul benötigt:

- MQTT-Host
- Username
- Passwort
- Namen einer JS-Callback-Funktion

DJI verlangt für den Host je nach Transport `tcp://` oder `ws://`.

Die Credentials dürfen nicht aus statischer FH2-Frontend-Konfiguration
erfunden oder aus Backend-/DRC-Credentials wiederverwendet werden.

### api

Benötigt:

- HTTPS-Basis-URL
- Token

DJI überträgt diesen Token als `X-Auth-Token`.

### ws

Benötigt:

- WSS-Host
- Token
- Callback-Namen

### map / tsa

DJI dokumentiert vor diesen Modulen den geladenen Cloud-/Thing- und
WebSocket-Kontext.

### media

Benötigt einen gesetzten Workspace und den Cloud-/Thing-Kontext. Parameter
für Auto-Upload werden nur gesetzt, wenn sie explizit konfiguriert werden.

### mission

Für den vollständigen Pilot-Wayline-Pfad gelten gemeinsam die DJI-Verträge
aus JSBridge und Wayline Management:

- Workspace gesetzt
- Cloud-/Thing-Kontext verfügbar
- WebSocket-Kontext verfügbar
- API-Modul für HTTPS-Wayline-Operationen konfiguriert
- erst danach Mission-Modul laden

FH2 behauptet ohne diese Voraussetzungen keine Wayline-Management-Capability.

## Livestream

DJI JSBridge unterstützt im `liveshare`-Modul auch manuelles RTMP:

```text
liveshareSetConfig(
  2,
  JSON.stringify({ url: "rtmp://<fh2-mediamtx>/fh2/<stream-key>" })
)
```

Der Low-Level-Adapter stellt dafür bereit:

```text
setVideoPublishType()
configureRtmpLivestream()
startManualLivestream()
stopManualLivestream()
getLivestreamStatus()
```

Das ändert den FH2-Standard nicht:

```text
DJI Pilot 2
  -> RTMP
  -> MediaMTX
  -> WebRTC
  -> FH2 WebUI
```

Der bevorzugte servergesteuerte Pfad bleibt die DJI Cloud API über
`live_start_push`. Die JSBridge-Variante ist eine Pilot-2-WebView-
Integration für den manuellen App-seitigen Pfad.

Beide Pfade nutzen **nicht** den deaktivierten FlightHub-2-/SIKONG-CE-
Bezahlstream.

Livestream-Start/-Stop bleibt in FH2 FC1. Der Bridge-Client stellt nur das
Low-Level-Primitive bereit; die WebUI startet keinen Stream ungeprüft.

## Security

JSBridge ist kein Weg, die FH2-Sicherheitsarchitektur zu umgehen.

Nicht zulässig:

- FH2-DRC-Relay-Credentials in Vite-Variablen
- Backend-MQTT-Passwörter in Vite-Variablen
- `FH2_USER_TOKEN` als JSBridge-Token
- EMQX-Interntokens im WebView
- automatische FC2-/FC3-Aktivierung durch ein geladenes Pilot-Modul

DJIs `appId`, `appKey` und `license` müssen für
`platformVerifyLicense()` zur Laufzeit im WebView verfügbar sein. Die
aktuelle Vite-Integration macht diese Werte daher **browser-sichtbar**. Sie
dürfen ausschließlich für den DJI-JSBridge-License-Vertrag verwendet und
niemals als serverseitige FH2-Secrets wiederverwendet werden.

MQTT-/API-/WS-Module erhalten ihre Betriebscredentials erst aus einem
explizit freigegebenen Runtime-Pfad.

## Konfiguration

```text
VITE_DJI_JSBRIDGE_ENABLED
VITE_DJI_JSBRIDGE_VERIFY_LICENSE
VITE_DJI_JSBRIDGE_APP_ID
VITE_DJI_JSBRIDGE_APP_KEY
VITE_DJI_JSBRIDGE_LICENSE
VITE_DJI_JSBRIDGE_WORKSPACE_ID
VITE_DJI_JSBRIDGE_PLATFORM_NAME
VITE_DJI_JSBRIDGE_WORKSPACE_NAME
VITE_DJI_JSBRIDGE_WORKSPACE_DESCRIPTION
```

Standard:

```text
VITE_DJI_JSBRIDGE_ENABLED=false
VITE_DJI_JSBRIDGE_VERIFY_LICENSE=true
```

Die Bridge wird erst aktiviert, wenn die Deployment-Konfiguration sie
explizit einschaltet.

## Herstellerreferenz

Verbindliche Quelle:

```text
dji-sdk/Cloud-API-Doc
docs/en/60.api-reference/10.pilot-to-cloud/30.jsbridge.md
```

Ergänzende Funktionsverträge:

- Pilot access to cloud
- Pilot livestream
- Pilot map elements
- Pilot media management
- Pilot wayline management
- Pilot situation awareness
