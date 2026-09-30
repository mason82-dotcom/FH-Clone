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
4. `platformSetWorkspaceId(...)`
5. `platformSetInformation(...)`
6. `platformLoadComponent("thing", ...)`
7. `thingGetConnectState()`

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

Ein realer RC-Pro-Enterprise-Test mit FH2 zeigte, dass der obere Zurück-Pfeil
bei einer lediglich geladenen `thing`-Komponente den MQTT-Client beendet.
Der Softwarepfad darf deshalb **keine** Persistenz allein aus
`platformLoadComponent("thing", ...)` ableiten.

Der reale Test nach #116 zeigte weiterhin einen Disconnect beim Verlassen des
WebViews. Der Vergleich mit dem offiziellen DJI-Cloud-API-Demo zeigte den
entscheidenden Reihenfolge-Unterschied: dort werden Workspace-ID und
Plattforminformation **vor** dem Laden der Thing-Komponente gesetzt. FH2 setzt
deshalb vor `platformLoadComponent("thing", ...)`:

- `platformSetWorkspaceId(...)`
- `platformSetInformation(...)`

Die Workspace-ID stammt aus der nicht geheimen Laufzeitvariable
`DJI_PILOT_WORKSPACE_ID`, wird beim Web-Build an
`VITE_DJI_PILOT_WORKSPACE_ID` weitergereicht und muss eine UUID sein.
App Key, License und MQTT-Passwort bleiben davon getrennt und werden weiterhin
nicht ins Web-Bundle geschrieben.

Der registrierte `onBackClick`-Handler entspricht weiter dem normalen
Pilot-2-Root-WebView-Verhalten. FH2 ruft weder `thingDisconnect()` noch
`platformUnloadComponent("thing")` noch `platformStopSelf()` auf.

Ob der DJI-native Cloud-/MQTT-Link nach Wechsel in die Flugansicht tatsächlich
aktiv bleibt, ist ein **reales Hardware-Gate** und wird nicht aus dem
JavaScript-Lebenszyklus abgeleitet. Der Zustand muss serverseitig über
EMQX-Clientzahl und fortlaufende `dji-cloud`-Telemetrie bestätigt werden.

**Abmelden / Exit Cloud Platform** ist ausdrücklich ein Disconnect-Vorgang und
wird von FH2 nicht verhindert.

## Hardware-Evidence

Die Softwareintegration ist unabhängig von der realen Pilot-2-Abnahme.

Für die reale Abnahme existiert die dedizierte Route:

```text
/pilot-evidence
```

Der Übergang von `/pilot-login` auf diese Route erfolgt innerhalb der
bereits laufenden SPA und löst absichtlich **keinen vollständigen
Dokument-/WebView-Reload** aus. Damit bleibt der von DJI Pilot 2 bereits
verifizierte JSBridge-Kontext erhalten. Direkte Navigation auf
`/pilot-evidence` bleibt weiterhin möglich, ist aber für Hardware-Captures
nicht der bevorzugte Pfad.

Sie verwendet ausschließlich den bereits verifizierten read-only
`DjiPilotBridgeClient`. Der Browser sendet RC-/Aircraft-Identität nur an den
lokalen Control-API-Endpunkt:

```http
POST /api/dji/pilot2/evidence
```

Die Control API prüft das Identitätspaar exakt gegen die aktuelle
DJI-`update_topo`-Runtime, hasht beide Identitäten unmittelbar per SHA-256 und
hält ausschließlich die redigierte Evidence im Arbeitsspeicher. Roh-
Seriennummern werden nicht über den Evidence-Endpunkt zurückgegeben und nicht
als Evidence persistiert.

Der zuletzt erfolgreiche redigierte Capture ist lokal abrufbar über:

```http
GET /api/dji/pilot2/evidence/latest
```

Auf dem Pi wird daraus das öffentliche Fixture erzeugt:

```bash
npm run export:pilot2-evidence -- --real-hardware
```

Der Exporter führt zusätzlich den Browser-Safety-/Secret-Scan des aktuellen
Quellstands aus. Nur bei grünem Scan wird
`browserBundleSecretScanPass=true` in das Fixture geschrieben.

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
- serverseitige Ausgabe oder automatische Erzeugung von Workspace-Credentials,
- JSBridge-Media-Write,
- JSBridge-Livestream-Control,
- Mission-/Wayline-Write über JSBridge.

Diese Funktionen benötigen jeweils einen eigenen authentisierten Backend-
Vertrag und eine neue Safety-/Security-Abnahme.
