# FlightHub 2 Frontend Standalone Components

## Zweck

FH-Clone bindet die offiziellen DJI FlightHub-2-Frontend-Standalone-Komponenten
direkt über die von FlightHub 2 On-Premises gelieferte Browser-Runtime
`paas.js` ein.

Diese Integration ist bewusst ein **direkter Browserpfad zu FlightHub 2
On-Premises** und kein Ersatz für die FH-Clone Control API.

## Verbindlicher Browser-Vertrag

Die Runtime wird einmal geladen:

```html
<script src="https://FH2-HOST/paas.js" fh2></script>
```

Danach ist die globale API verfügbar:

```text
window.FH2
```

FH-Clone verwendet diese globale API direkt für alle offiziellen
Standalone-Komponenten.

Der Initialisierungskontext wird zentral über `Fh2Provider` genau einmal pro
Konfiguration gesetzt:

```ts
window.FH2.initConfig({
  serverUrl,
  wssUrl,
  hostUrl,
  prjId,
  projectToken
});
```

## Übernommene Komponenten

### Project Map

```ts
window.FH2.loadProject("project-app-container");
window.FH2.destroyProject();
```

### Wayline Creation

```ts
window.FH2.loadWaylineCreation("wayline-create-app-container");
window.FH2.destroyWaylineCreation();
```

Events:

- `wayline-creation-saved`
- `wayline-creation-cancel`

### Wayline Editor

```ts
window.FH2.loadWayline("wayline-app-container", {
  wayline_id
});
window.FH2.destroyWayline(true);
```

Events:

- `wayline-save`
- `wayline-cancel`
- `wayline-back`

### Flight Path Viewer

Dieser Bereich ist getrennt von der Missionsplanung.

```ts
window.FH2.loadFlightPath("project-app-container", {
  flight_path_id
});
window.FH2.destroyFlightPath();
```

Event:

- `flight-path-back`

### Virtual Cockpit

Aktueller dokumentierter Vertrag:

```ts
window.FH2.loadCockpit("cockpit-app-container", {
  gatewaySn,
  droneSn,
  map: true
});
```

Das DJI-v1.5-Demo verwendet noch:

```ts
{
  gateway_sn,
  drone_sn
}
```

FH-Clone unterstützt deshalb beide Varianten über:

```text
VITE_FH2_COCKPIT_PROP_STYLE=camel|snake
```

Standard ist `camel`.

## Gateway + Aircraft Identity

Das Virtual Cockpit arbeitet mit zwei getrennten Identitäten:

```text
gatewaySn = RC Pro Enterprise / RC Plus 2
droneSn   = M3E/M3T/M4E/M4T
```

Die WebUI liest `/api/dji/topology` und bietet die durch `update_topo`
erkannten Gateway-Aircraft-Paare zur Auswahl an.

Die Identitäten werden nicht zusammengelegt.

## Eventbus

DJI dokumentiert `window.FH2.subscribe(...)`, aber keinen allgemeinen
`unsubscribe()`-Vertrag.

FH-Clone registriert deshalb pro DJI-Event nur einen globalen Listener und
verteilt die Ereignisse anschließend intern an React-Abonnenten.

Dadurch erzeugen React-Mount/Unmount-Zyklen keine wachsende Zahl globaler
DJI-Listener.

## Cesium Viewer Bridge

DJI stellt seine Viewer global bereit:

```ts
window.FH2.cesiumViewer
window.Cesium
```

FH-Clone wartet auf:

```text
cesium-viewer-change
```

und stellt den gewünschten Viewer über `useFh2CesiumViewer()` für eigene
Layer bereit.

Es wird keine zweite Cesium-Instanz über der DJI-Karte erzeugt.

Mögliche eigene Layer:

- RTK-Status
- Thermal-/POI-Markierungen
- Multispektralflächen
- UgCS-Waypoints
- Geofences
- Detektionsresultate
- weitere FH2-Fachdaten

## CSS Theme Bridge

Die von DJI vorgesehenen CSS-Variablen werden global gesetzt:

- `--fh2-basic-bg-color`
- `--fh2-sub-bg-color`
- `--fh2-primary-color`
- `--fh2-primary-hover-color`
- `--fh2-primary-focus-color`
- `--fh2-primary-disabled-color`
- `--fh2-list-primary-active-color`
- `--fh2-list-primary-hover-color`
- `--fh2-sub-primary-color`
- `--fh2-sub-primary-hover-color`
- `--fh2-model-content-bg-color`
- `--fh2-input-highlight-color`
- `--fh2-input-border-color`

Die Parent-Struktur der DJI-Komponenten verwendet bewusst kein
`transform`, `perspective`, `filter`, `will-change` oder
`contain: paint`, weil DJI für solche Layouts Positionierungsprobleme bei
Overlays dokumentiert.

## Expliziter Lifecycle

Jede React-Ansicht besitzt ein symmetrisches Lifecycle-Paar:

```text
mount   -> window.FH2.load*
unmount -> window.FH2.destroy*
```

Dadurch bleiben Project Map, Wayline Editor, Flight Path und Cockpit logisch
getrennt.

## Route Planning vs. Flight History

FH-Clone behandelt:

```text
Wayline Creation / Editor
= Planung

Flight Path Viewer
= tatsächlich geflogener Verlauf
```

als getrennte Domänen und getrennte Navigationseinträge.

## Security Boundary

Die direkte `window.FH2`-Nutzung ist eine explizite Ausnahme von der sonst
geltenden Regel, dass die WebUI nur mit der FH-Clone Control API spricht.

Diese Ausnahme gilt ausschließlich für die offizielle FlightHub-2-
On-Premises-Frontend-Runtime.

Sie erlaubt **nicht**:

- MQTT-Credentials im Browser
- direkte `services`-Publishes
- direkte FH-Clone-DRC-Publishes
- Umgehung von Control Lease oder SafetyGate im FH-Clone-Control-Pfad

Das offizielle DJI Virtual Cockpit ist ein eigener nativer FlightHub-
Control-Pfad. Es ist deshalb standardmäßig deaktiviert:

```text
VITE_FH2_NATIVE_COCKPIT_ENABLED=false
```

Eine Aktivierung bedeutet bewusst, dass der Bediener die native DJI-
Steuerfläche des On-Premises-Systems verwendet.

## Tokens

`VITE_FH2_PROJECT_TOKEN` wird von `paas.js` im Browser benötigt und ist
deshalb technisch browser-sichtbar.

Er darf niemals mit dem serverseitigen:

```text
FH2_USER_TOKEN
```

der FH-Clone OpenAPI-Integration verwechselt oder wiederverwendet werden.

Serverseitige OpenAPI-, MQTT-, DRC-, NTRIP- oder EMQX-Secrets gehören niemals
in `VITE_*`-Variablen.

## Build-Konfiguration

Da Vite `VITE_*` beim Build einbettet, reicht eine Änderung der
Container-Environment nach dem Build nicht aus.

`compose.yaml` übergibt die Standalone-Werte deshalb als Build-Args an
`infra/docker/web.Dockerfile`.

Nach einer Änderung dieser Werte muss das Web-Image neu gebaut werden.

## Aktuelle Dateien

```text
apps/web/src/fh2/
  config.ts
  Fh2Provider.tsx
  events.ts
  useFh2CesiumViewer.ts
  fh2-global.d.ts

apps/web/src/components/fh2/
  Fh2Views.tsx
  Fh2Workspace.tsx
```

## Herstellerreferenz

Referenz-Demo:

```text
dji-sdk/FlightHub-2-Frontend-Standalone-Component
```

Die öffentliche Demo steht unter Apache-2.0. Die vom On-Premises-System
gelieferte `paas.js` und die DJI-Microfrontends sind davon lizenzrechtlich
getrennt zu betrachten.


## Eigene Cesium-Layer im DJI Viewer

FH-Clone erzeugt keine zweite Cesium-Instanz. Eigene Fachdaten werden direkt in:

```ts
window.FH2.cesiumViewer.global
```

eingehängt.

Die Implementierung liegt in:

```text
apps/web/src/fh2/overlays.ts
apps/web/src/fh2/Fh2OverlayController.tsx
```

### Layer-Namensräume

Alle von FH-Clone erzeugten Cesium-Entities besitzen stabile IDs:

```text
fh2:rtk:<id>
fh2:thermal:<id>
fh2:multispectral:<id>
fh2:ugcs:<id>
```

Dadurch kann jeder Layer unabhängig aktualisiert oder entfernt werden, ohne
Entities der DJI-Microfrontends oder anderer FH2-Layer anzutasten.

Unterstützte Geometrien:

- Punkt
- Polyline
- Polygon

### RTK

Der RTK-Layer ist bereits mit echten Runtime-Daten verbunden.

Quellen:

```text
/api/events/rtk
/api/rtk
/api/devices/{deviceSn}/telemetry
```

RTK-Status und normalisierte Aircraft-Position werden über `deviceSn`
korreliert. Für die Höhe wird bevorzugt:

```text
flight.altitude.ellipsoid_m
```

und nur als Fallback:

```text
flight.altitude.relative_m
```

verwendet.

### M4T Thermal

Für erkannte Matrice-4T-Aircraft:

```text
domain=0
type=99
sub_type=1
```

wird die reale Aircraft-Position als Thermal-Sensorträger im Layer geführt.

Solange kein verifizierter Media-/Radiometrie-Feed mit räumlichem Footprint
vorliegt, erzeugt FH-Clone ausdrücklich **keine** erfundenen Temperaturflächen,
Isothermen oder Kamera-Footprints.

### Thermal-/Multispektral-Medien

Georeferenzierte `MediaAsset`-Objekte können über den internen Media-Ingest
eingespielt werden. Der Kartenfeed verwendet ausschließlich reale
`CaptureContext.latitudeDeg/longitudeDeg`-Werte.

Öffentlich read-only:

```text
GET /api/media/overlays
```

Intern:

```text
POST /internal/media/assets
Authorization: Bearer <MEDIA_INGEST_TOKEN>
```

Thermal-, MULTISPECTRAL- und NDVI-Assets erscheinen als Capture-Punkte. Ein
Asset ohne belastbare GPS-Koordinate bleibt im Registry-Kontext erhalten, wird
aber nicht auf der Karte dargestellt.

Aus einem ProcessingProfile oder aus der bloßen Anwesenheit eines M3M/M4T wird
weiterhin **keine** künstliche Fläche, kein Kamera-Footprint und kein
Temperaturraster konstruiert.

### UgCS

Die UCS-Bridge liefert jetzt echte Route-Geometrie:

```text
Route
 -> SegmentDefinition
    -> Figure
       -> FigurePoint[]
```

Latitude/Longitude werden in der Bridge von UgCS-Radiant nach Grad normiert.
Absolute WGS84-Höhen werden als `altitudeM` geführt. Reine AGL-Höhen werden
nicht fälschlich als absolute Cesium-Höhen behandelt; solche Routen werden als
2D-/terrain-gebundene Geometrie dargestellt.

Die Control API stellt read-only bereit:

```text
GET /api/ugcs/status
GET /api/ugcs/vehicles
GET /api/ugcs/routes
GET /api/ugcs/telemetry
```

Die UgCS-Liveposition nutzt Telemetrie-Semantik statt Feldnamenraten:
`S_LATITUDE`, `S_LONGITUDE`, optional `S_ALTITUDE_AMSL`.

### Producer-Vertrag

Fachdienste können Layerdaten unabhängig einspeisen:

```ts
setFh2OverlayFeatures(kind, producerId, features)
clearFh2OverlayProducer(kind, producerId)
```

Damit bleiben Datenquelle und Cesium-Rendering getrennt.

### UI

Die Workspace-Leiste enthält unabhängige Schalter für:

```text
RTK
M4T Thermal
Multispektral
UgCS
```

inklusive Entity-Zähler und Anzeige, ob der globale DJI-Cesium-Viewer bereits
verfügbar ist.
