# DJI WPML Parser-Importliste

## Zweck

Diese Liste ist der verbindliche Importvertrag für den geplanten FH2-WPML-Parser.
Sie beschreibt, welche Felder aus `template.kml` gelesen, normalisiert,
validiert oder nur roh erhalten werden.

Wichtig:

```text
template.kml
  = Planungs-/Template-Datei

waylines.wpml
  = ausführbare Wayline-Datei
```

Das Parsen einer WPML-Datei erzeugt **keine** `mission.wayline`-
Ausführungsfreigabe. Import, Anzeige und Analyse bleiben FC0/read-only.
Ausführung bleibt ein separater FC2-Vertrag.

Offizielle DJI-Referenzen:

- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/common-element.html
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/waylines-wpml.html
- https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html

## Parser-Grundsätze

Der Importer muss:

- XML namespaces korrekt behandeln,
- KML-Standardgeometrie und DJI-`wpml:`-Elemente getrennt lesen,
- unbekannte `wpml:`-Elemente nicht still verwerfen,
- originale Rohwerte für Roundtrip/Diagnose erhalten,
- Zahlen strikt als endliche Zahlen validieren,
- Listenwerte wie `wide,ir` als geordnete Enum-Liste lesen,
- IDs nicht aus Dateinamen oder Reihenfolge erfinden,
- keine DJI-Produktfähigkeit aus bloß vorhandenen XML-Feldern ableiten,
- DTD/External Entities ablehnen,
- beim späteren KMZ-Import Pfad-Traversal und unbeschränkte ZIP-Expansion
  verhindern.

Empfohlenes Ergebnis:

```ts
WpmlTemplateImport {
  source
  metadata
  missionConfig
  templates[]
  warnings[]
  unknownElements[]
}
```

## Priorität P0 – vollständig importieren

### 1. Dokument und Namespace

Importieren:

```text
kml
Document
xmlns = http://www.opengis.net/kml/2.2
xmlns:wpml
```

Bekannte DJI-WPML-Namespace-Versionen müssen erkannt werden. Die konkrete
Namespace-URI bleibt als Rohwert erhalten und darf nicht durch den Parser
umgeschrieben werden.

### 2. Dateiinformation

Parent: `Document`

```text
wpml:author
wpml:createTime
wpml:updateTime
```

Normalisierung:

- `author` -> String
- `createTime` / `updateTime` -> Unix-Millisekunden
- fehlende Werte sind zulässig

### 3. missionConfig

Parent: `wpml:missionConfig`

```text
wpml:flyToWaylineMode
wpml:finishAction
wpml:exitOnRCLost
wpml:executeRCLostAction
wpml:takeOffSecurityHeight
wpml:takeOffRefPoint
wpml:takeOffRefPointAGLHeight
wpml:globalTransitionalSpeed
wpml:droneInfo
wpml:payloadInfo
wpml:autoRerouteInfo
```

Enums mindestens roh + typisiert erhalten:

```text
flyToWaylineMode:
  safely
  pointToPoint

finishAction:
  goHome
  noAction
  autoLand
  gotoFirstWaypoint

exitOnRCLost:
  goContinue
  executeLostAction

executeRCLostAction:
  goBack
  landing
  hover
```

`executeRCLostAction` ist nur dann semantisch erforderlich, wenn
`exitOnRCLost=executeLostAction`.

`takeOffRefPoint` wird als DJI-Tripel gelesen und nicht als generisches
KML-`coordinates` behandelt.

### 4. droneInfo

```text
wpml:droneEnumValue
wpml:droneSubEnumValue
```

Regeln:

- numerische DJI-Produktwerte importieren,
- bekannte Produkte optional beschreiben,
- unbekannte Werte **nicht ablehnen**,
- Produkt-ID nie in Runtime-Control-Capabilities übersetzen.

Die aktuelle DJI-WPML-Dokumentation führt M4E/M4T ausdrücklich als
unterstützte WPML-Produkte.

### 5. payloadInfo

```text
wpml:payloadEnumValue
wpml:payloadPositionIndex
```

Regeln:

- `payloadEnumValue` und `payloadPositionIndex` getrennt speichern,
- daraus keinen MQTT-`payload_index`-String erfinden,
- `payloadPositionIndex` entspricht der Gimbal-/Montageposition,
- unbekannte Payloadtypen raw erhalten.

### 6. Template-Folder

Parent: `Folder`

```text
wpml:templateType
wpml:templateId
wpml:autoFlightSpeed
wpml:waylineCoordinateSysParam
wpml:payloadParam
```

Unterstützte `templateType`-Werte:

```text
waypoint
mapping2d
mapping3d
mappingStrip
```

Unbekannte zukünftige Typen:

```text
parse = ja
typed support = unknown
execution = nein
```

### 7. waylineCoordinateSysParam

```text
wpml:coordinateMode
wpml:heightMode
wpml:positioningType
wpml:globalShootHeight
wpml:surfaceFollowModeEnable
wpml:surfaceRelativeHeight
```

Höhenreferenzen dürfen nicht zusammengelegt werden. Insbesondere müssen
Ellipsoid-, EGM96-, Startpunkt- und Surface-/AGL-Bezüge unterscheidbar bleiben.

### 8. payloadParam

```text
wpml:payloadPositionIndex
wpml:focusMode
wpml:meteringMode
wpml:dewarpingEnable
wpml:returnMode
wpml:samplingRate
wpml:scanningMode
wpml:modelColoringEnable
wpml:imageFormat
```

`imageFormat` wird als Liste geparst.

Bekannte Werte:

```text
wide
zoom
ir
narrow_band
visible
```

Diese Werte beschreiben die gewünschte Speicher-/Sensorquelle und sind
**nicht** identisch mit einer Payload-ID.

### 9. KML-Geometrie

Für `waypoint`:

```text
Placemark
Point
coordinates
```

Für Mapping-Flächen:

```text
Placemark
Polygon
outerBoundaryIs
LinearRing
coordinates
```

Für `mappingStrip`:

```text
Placemark
LineString
coordinates
```

Koordinatenregeln:

- KML-Reihenfolge ist `longitude,latitude[,height]`,
- keine automatische Vertauschung in `lat,lon`,
- Longitude [-180, 180],
- Latitude [-90, 90],
- optionale Höhe separat erhalten,
- Polygon-Reihenfolge beibehalten,
- keine Geometrie automatisch schließen oder umsortieren.

### 10. Waypoint-Felder

Parent: Waypoint-`Placemark`

```text
wpml:isRisky
wpml:index
wpml:useGlobalHeight
wpml:ellipsoidHeight
wpml:height
wpml:useGlobalSpeed
wpml:waypointSpeed
wpml:useGlobalHeadingParam
wpml:waypointHeadingParam
wpml:useGlobalTurnParam
wpml:waypointTurnParam
wpml:useStraightLine
wpml:gimbalPitchAngle
```

Globale und lokale Werte müssen getrennt bleiben. Der Parser soll den
effektiven Wert optional **derived** berechnen, aber den Originalvertrag
nicht überschreiben.

### 11. Heading

```text
wpml:globalWaypointHeadingParam
wpml:waypointHeadingParam

wpml:waypointHeadingMode
wpml:waypointHeadingAngle
wpml:waypointPoiPoint
wpml:waypointHeadingPathMode
```

POI-Koordinaten separat als DJI-Wert importieren.

### 12. Turn Parameter

```text
wpml:globalWaypointTurnMode
wpml:waypointTurnParam
wpml:waypointTurnMode
wpml:waypointTurnDampingDist
wpml:globalUseStraightLine
wpml:useStraightLine
```

Der Parser soll Turn-Mode und Straight-Line-Flag gemeinsam validieren, aber
nicht automatisch in einen eigenen Flugalgorithmus umdeuten.

## Priorität P1 – Template-spezifische Planung

### mapping2d

Importieren:

```text
wpml:caliFlightEnable
wpml:elevationOptimizeEnable
wpml:smartObliqueEnable
wpml:smartObliqueGimbalPitch
wpml:shootType
wpml:direction
wpml:margin
wpml:overlap
wpml:ellipsoidHeight
wpml:height
wpml:facadeWaylineEnable
wpml:mappingHeadingParam
wpml:gimbalPitchMode
wpml:gimbalPitchAngle
Polygon
```

### mapping3d

Importieren:

```text
wpml:caliFlightEnable
wpml:inclinedGimbalPitch
wpml:inclinedFlightSpeed
wpml:shootType
wpml:direction
wpml:margin
wpml:overlap
wpml:ellipsoidHeight
wpml:height
Polygon
```

### mappingStrip

Importieren:

```text
wpml:caliFlightEnable
wpml:shootType
wpml:direction
wpml:margin
wpml:singleLineEnable
wpml:cuttingDistance
wpml:boundaryOptimEnable
wpml:leftExtend
wpml:rightExtend
wpml:includeCenterEnable
wpml:overlap
wpml:ellipsoidHeight
wpml:height
wpml:stripUseTemplateAltitude
LineString
```

### Overlap

```text
wpml:orthoLidarOverlapH
wpml:orthoLidarOverlapW
wpml:orthoCameraOverlapH
wpml:orthoCameraOverlapW
wpml:inclinedLidarOverlapH
wpml:inclinedLidarOverlapW
wpml:inclinedCameraOverlapH
wpml:inclinedCameraOverlapW
```

### Mapping heading

```text
wpml:mappingHeadingMode
wpml:mappingHeadingAngle
```

## Priorität P1 – Action Groups

Actions werden vollständig **geparst**, aber dadurch nicht ausführbar.

### actionGroup

```text
wpml:actionGroupId
wpml:actionGroupStartIndex
wpml:actionGroupEndIndex
wpml:actionGroupMode
wpml:actionTrigger
wpml:action
```

### actionTrigger

```text
wpml:actionTriggerType
wpml:actionTriggerParam
```

### action

```text
wpml:actionId
wpml:actionActuatorFunc
wpml:actionActuatorFuncParam
```

Bekannte Action-Typen:

```text
takePhoto
startRecord
stopRecord
focus
zoom
customDirName
gimbalRotate
gimbalEvenlyRotate
rotateYaw
hover
accurateShoot
orientedShoot
panoShot
recordPointCloud
```

Unbekannte Actions werden als `unknown` mit vollständigen Raw-Parametern
übernommen.

## Action-Parameter

### takePhoto / startRecord

```text
wpml:payloadPositionIndex
wpml:fileSuffix
wpml:payloadLensIndex
wpml:useGlobalPayloadLensIndex
```

`payloadLensIndex` ist ebenfalls eine Liste und kann unter anderem
`wide`, `zoom`, `ir`, `narrow_band` und sichtbare Quellen enthalten.

### stopRecord

```text
wpml:payloadPositionIndex
wpml:payloadLensIndex
```

### focus

```text
wpml:payloadPositionIndex
wpml:isPointFocus
wpml:focusX
wpml:focusY
wpml:focusRegionWidth
wpml:focusRegionHeight
wpml:isInfiniteFocus
```

### zoom

```text
wpml:payloadPositionIndex
wpml:focalLength
```

### customDirName

```text
wpml:payloadPositionIndex
wpml:directoryName
```

### gimbalRotate

```text
wpml:payloadPositionIndex
wpml:gimbalHeadingYawBase
wpml:gimbalRotateMode
wpml:gimbalPitchRotateEnable
wpml:gimbalPitchRotateAngle
wpml:gimbalRollRotateEnable
wpml:gimbalRollRotateAngle
wpml:gimbalYawRotateEnable
wpml:gimbalYawRotateAngle
wpml:gimbalRotateTimeEnable
wpml:gimbalRotateTime
```

### gimbalEvenlyRotate

```text
wpml:gimbalPitchRotateAngle
wpml:payloadPositionIndex
```

### rotateYaw

```text
wpml:aircraftHeading
wpml:aircraftPathMode
```

### hover

```text
wpml:hoverTime
```

### accurateShoot

Alle dokumentierten Felder importieren, aber als Legacy-/produktspezifische
Action kennzeichnen. Keine automatische Konvertierung nach `orientedShoot`.

### orientedShoot

Mindestens vollständig importieren:

```text
wpml:gimbalPitchRotateAngle
wpml:gimbalYawRotateAngle
wpml:focusX
wpml:focusY
wpml:focusRegionWidth
wpml:focusRegionHeight
wpml:focalLength
wpml:aircraftHeading
wpml:accurateFrameValid
wpml:payloadPositionIndex
wpml:payloadLensIndex
wpml:useGlobalPayloadLensIndex
wpml:targetAngle
wpml:actionUUID
wpml:imageWidth
wpml:imageHeight
wpml:AFPos
wpml:gimbalPort
wpml:orientedCameraType
wpml:orientedFilePath
wpml:orientedFileMD5
wpml:orientedFileSize
wpml:orientedFileSuffix
wpml:orientedCameraApertue
wpml:orientedCameraLuminance
wpml:orientedCameraShutterTime
wpml:orientedCameraISO
wpml:orientedPhotoMode
```

`actionUUID` ist besonders wichtig für spätere Media-Korrelation und soll
nicht neu generiert werden, wenn es vorhanden ist.

### panoShot

```text
wpml:payloadPositionIndex
wpml:payloadLensIndex
wpml:useGlobalPayloadLensIndex
wpml:panoShotSubMode
```

### recordPointCloud

```text
wpml:payloadPositionIndex
wpml:recordPointCloudOperate
```

## Priorität P2 – Raw erhalten, später typisieren

Diese Gruppen dürfen im ersten Parser vollständig als Rohstruktur erhalten
werden, solange noch kein neutraler FH2-Domänentyp existiert:

- produktspezifische `accurateShoot`-Parameter,
- produktspezifische Kamera-Type-Enums,
- LiDAR-spezifische Payload-Parameter,
- Auto-Reroute-Details,
- zukünftige DJI-`wpml:`-Elemente,
- unbekannte Action-Parameter,
- unbekannte Template-Typen.

Regel:

```text
unknown != invalid
```

Nur strukturell ungültige Pflichtdaten erzeugen einen Importfehler.

## Nicht in den Core übernehmen

Nicht als Core-Fähigkeit oder Runtime-State ableiten:

- `mission.wayline` nur weil WPML importiert wurde,
- Flight-Control-Capability aus `droneEnumValue`,
- Kamera-Control-Capability aus `payloadInfo`,
- RTK-Fix aus einem WPML-Produktprofil,
- Sensoridentität ausschließlich aus Payloadtyp,
- tatsächliche Missionsausführung aus einer vorhandenen Action-Liste.

## Validierungsstufen

### ERROR

Import abbrechen bei:

- ungültigem XML,
- DTD/External Entity,
- fehlendem `Document`,
- ungültiger numerischer Pflichtangabe,
- nicht parsebarer Pflichtgeometrie,
- Waypoint-Koordinaten außerhalb gültiger Lon/Lat-Grenzen,
- doppelten IDs dort, wo DJI Eindeutigkeit verlangt und eine eindeutige
  Zuordnung sonst unmöglich ist.

### WARNING

Import fortsetzen bei:

- unbekanntem `templateType`,
- unbekanntem DJI-Produkt-/Payloadenum,
- unbekannter Action,
- unbekanntem `wpml:`-Element,
- fehlendem optionalen Feld,
- Produkt-Support-Matrix passt nicht zur Datei,
- uneindeutiger Sensor-/Lens-Zuordnung.

## Geplante Parser-Ausgabe

```ts
interface WpmlTemplateImport {
  namespaceUri: string;
  author?: string;
  createTimeMs?: number;
  updateTimeMs?: number;
  missionConfig: WpmlMissionConfig;
  templates: WpmlTemplate[];
  warnings: WpmlImportWarning[];
  unknownElements: WpmlRawElement[];
}
```

Für jedes Template:

```ts
interface WpmlTemplate {
  templateId: number;
  templateType: "waypoint" | "mapping2d" | "mapping3d" | "mappingStrip" | "unknown";
  autoFlightSpeedMps?: number;
  coordinateSystem?: WpmlCoordinateSystem;
  payload?: WpmlPayloadParam;
  geometry?: WpmlGeometry;
  waypoints?: WpmlWaypoint[];
  actions?: WpmlActionGroup[];
  rawExtensions: WpmlRawElement[];
}
```

## Implementierungsreihenfolge

1. sicherer XML-Reader + Namespace-Auflösung,
2. Document-/MissionConfig-Parser,
3. Produkt-/Payload-Info,
4. Template-Folder + Koordinatensystem,
5. KML-Geometrie,
6. Waypoint-Felder,
7. Heading-/Turn-Parameter,
8. ActionGroup + generischer Action-Parser,
9. typisierte Standard-Actions,
10. Mapping2D/3D/Strip,
11. Import-Warnings/Unknown-Element-Erhalt,
12. KMZ-Container und später `waylines.wpml`.

Erst danach soll eine getrennte Export-/Execution-Schicht bewertet werden.
