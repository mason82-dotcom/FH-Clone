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

## Read-only Runtime: explizit verbotene Browserpfade

Der CI-Guard `scripts/verify-pilot2-jsbridge.mjs` blockiert im allgemeinen
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

Damit kann ein credential-tragender Pilot-2-Bootstrap nicht versehentlich
durch eine normale Frontendänderung aktiviert werden.

## V3.1: dedizierter Pilot-2-Cloud-Bootstrap

Für die reale Pilot-to-Cloud-/MQTT-Hardwarequalifikation existiert getrennt
vom read-only Runtimeblock die Route:

```text
/pilot-login
```

Sie ist ausschließlich für den DJI-Pilot-2-WebView vorgesehen. Die Seite
führt nur nach einer ausdrücklichen Benutzeraktion folgende offizielle
JSBridge-Schritte aus:

1. `platformVerifyLicense(appId, appKey, license)`
2. `platformIsVerified()`
3. `platformGetRemoteControllerSN()`
4. `platformLoadComponent("thing", ...)`
5. `thingGetConnectState()`

Der Thing-Modul-Parameter enthält den MQTT-Broker im DJI-Format
`tcp://host:port`, Username und Passwort. App Key, License und MQTT-Passwort
werden vom Benutzer lokal in der Pilot-2-WebView eingegeben, nicht über
`VITE_*` eingebettet, nicht an einen FH2-HTTP-Endpunkt übertragen und nicht
in Browser-Storage persistiert. Nach Übergabe an DJI Pilot 2 werden die
Secret-Felder aus dem React-State geleert.

Die Seite lädt **keine** WS-, Livestream-, Media-, Mission- oder
Flight-Control-Komponente und setzt keine Workspace-Rechte. Sie erteilt weder
FC-Stufe noch Lease, Authority oder DRC-Rechte.

Der separate Test `npm run test:pilot2-bootstrap` schützt diese Grenze.

### Verlassen des Pilot-2-Menüs

Das DJI-`thing`-Modul ist ein natives Pilot-2-Funktionsmodul. FH2 behandelt
es deshalb getrennt vom Lebenszyklus des H5-WebViews:

- beim Zurückgehen aus der Drittanbieter-Cloud-Seite wird das Thing-Modul
  **nicht** entladen,
- FH2 ruft beim Menüwechsel keinen Thing-Disconnect auf,
- der registrierte `onBackClick`-Handler gibt `false` zurück, damit Pilot 2
  nur das WebView normal verlässt,
- beim erneuten Öffnen von `/pilot-login` wird
  `platformIsComponentLoaded("thing")` und anschließend
  `thingGetConnectState()` gelesen; ein bereits bestehender MQTT-Link wird
  ohne erneute Credential-Eingabe als verbunden angezeigt.

Das entspricht dem Lebenszyklus im offiziellen DJI-Cloud-API-Demo: bereits
geladene Module werden beim erneuten Öffnen erkannt und weiterverwendet.

**Abmelden / Exit Cloud Platform** ist davon ausdrücklich verschieden. Ein
bewusstes Beenden der Cloud-Plattform darf die native Verbindung beenden und
wird von FH2 nicht verhindert.

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

- unbeaufsichtigter/automatischer Pilot-2-Cloud-Bootstrap ohne Benutzeraktion,
- serverseitige Ausgabe von Gateway-/MQTT-Passwörtern an den Browser,
- API-/WS-Tokenbootstrap,
- Workspace-Konfiguration,
- JSBridge-Media-Write,
- JSBridge-Livestream-Control,
- Mission-/Wayline-Write über JSBridge.

Diese Funktionen benötigen jeweils einen eigenen authentisierten Backend-
Vertrag und eine neue Safety-/Security-Abnahme.
