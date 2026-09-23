# DJI Pilot 2 JSBridge

## Zweck

FH2 integriert die offizielle DJI-Pilot-2-WebView-Runtime
`window.djiBridge` als **read-only Laufzeitquelle** für UI-Kontext und
Hardware-Evidence.

Der Pfad bleibt strikt getrennt von:

- DJI Cloud API / MQTT,
- FH2 `window.FH2` Standalone Components,
- Android MSDK V5,
- Control Lease / Authority,
- FC0..FC3,
- DRC.

```text
window.djiBridge
  -> Pilot-2-WebView-Runtime
  -> read-only Identität / Version / Modulstatus
  -> exakter Abgleich gegen FH2 update_topo
  -> UI-Kontext

kein
  -> MQTT-Principal
  -> Control-Recht
  -> Lease
  -> FC-Freigabe
  -> DRC-Sitzung
```

## Offizieller DJI-Vertrag

Der aktuelle Upstream ist:

`dji-sdk/Cloud-API-Doc/docs/en/60.api-reference/10.pilot-to-cloud/30.jsbridge.md`

Für den integrierten FH2-Block werden ausschließlich folgende read-only
Aufrufe verwendet:

- `platformIsVerified()`
- `platformGetVersion()`
- `platformGetRemoteControllerSN()`
- `platformGetAircraftSN()`
- `platformIsComponentLoaded(name)`
- `thingGetConnectState()` nur wenn das Thing-Modul bereits geladen ist
- `wsGetConnectState()` nur wenn das WS-Modul bereits geladen ist

DJI dokumentiert außerdem schreibende bzw. credential-tragende JSBridge-
Funktionen. Diese gehören **nicht** zu diesem Runtimeblock.

## Verifikation

DJI verlangt eine verifizierte JSBridge-Lizenz, bevor die JSBridge-
Funktionen verwendet werden.

FH2 führt im Browser **keine automatische License-Verifikation** durch.

Insbesondere werden nicht in das Vite-Bundle aufgenommen:

- App-Key,
- License,
- MQTT-Benutzer/Passwort,
- API-Token,
- WS-Token,
- EMQX-/DRC-/Backend-Secrets.

Wenn Pilot 2 die Runtime nicht bereits als verifiziert meldet, bleibt FH2
fail-closed im Zustand `unverified`.

## Runtimezustände

Der Provider unterscheidet:

```text
unavailable
unverified
ready
error
```

`unavailable` ist der normale Zustand in einem gewöhnlichen Browser ohne
DJI-Pilot-2-WebView.

`ready` bedeutet ausschließlich:

- `window.djiBridge` ist vorhanden,
- Pilot 2 meldet `platformIsVerified() == true`,
- die read-only Runtimeabfrage war erfolgreich.

`ready` ist keine Control-Freigabe.

## Identitätsabgleich

Die Runtime liest:

```text
remoteControllerSn
aircraftSn
```

FH2 verwendet diese Werte nur dann zur automatischen UI-Kontextwahl, wenn
beide zusammen exakt einem bereits aus der FH2-Topologie bekannten Paar
entsprechen:

```text
Pilot2 remoteControllerSn == topology.gatewaySn
AND
Pilot2 aircraftSn == topology.subDevice.sn
```

Ein Teilmatch oder eine einzelne Seriennummer reicht nicht.

Die Topologie bleibt die serverseitig ermittelte Autorität für den UI-
Kontext. Aus dem JSBridge-Match werden keine Broker-, Safety- oder
Control-Rechte abgeleitet.

## Modulstatus

FH2 beobachtet read-only, ob Pilot 2 folgende Module bereits geladen hat:

- `thing`
- `liveshare`
- `api`
- `ws`
- `map`
- `tsa`
- `media`
- `mission`

Für `thing` und `ws` wird bei geladenem Modul zusätzlich nur der
Verbindungszustand gelesen.

FH2 lädt, entlädt oder konfiguriert in diesem Block keine Module.

## Explizit verbotene Browserpfade

Der CI-Guard `scripts/verify-pilot2-jsbridge.mjs` blockiert im
Pilot-Bridge-Frontend unter anderem:

- `platformVerifyLicense(...)`
- `platformLoadComponent(...)`
- `platformUnloadComponent(...)`
- Workspace-Mutationen
- API-Token lesen oder setzen
- `thingConnect(...)` / `thingDisconnect()`
- `wsConnect(...)` / `wsSend(...)`
- Livestream-Start/Stop/Config
- Media-Write-Operationen
- Vite-Variablen für App-Key, License, Token, Passwort oder Secrets

Damit kann ein späterer schreibender Pilot-2-Bootstrap nicht versehentlich
durch eine normale Frontendänderung aktiviert werden.

## Hardware-Evidence

Die Softwareintegration ist unabhängig von der realen Pilot-2-Abnahme.

Für eine Hardware-Supportzusage bleibt ein reales, redigiertes Fixture unter

`docs/fixtures/pilot2/jsbridge-session.json`

erforderlich. Es muss mindestens belegen:

- echte Pilot-2-JSBridge-Runtime,
- bereits verifizierte License,
- Pilot-2-Version,
- gehashte RC-/Aircraft-Identitäten,
- exakten FH2-Topologie-Pair-Match,
- erfassten read-only Modulstatus,
- bestandenen Browser-Safety-/Secret-Scan,
- keine Secrets im veröffentlichten Fixture.

Synthetische Fixtures zählen nicht als Hardwarebeleg.

## Nicht Bestandteil dieses Blocks

Nicht implementiert sind:

- automatischer Pilot-2-Cloud-Bootstrap,
- Ausgabe von Gateway-/MQTT-Credentials an den Browser,
- API-/WS-Tokenbootstrap,
- Workspace-Konfiguration,
- JSBridge-Media-Write,
- JSBridge-Livestream-Control,
- Mission-/Wayline-Write über JSBridge.

Diese Funktionen benötigen jeweils einen eigenen authentisierten Backend-
Vertrag und eine neue Safety-/Security-Abnahme.
