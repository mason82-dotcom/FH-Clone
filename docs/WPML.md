# DJI WPML und Pilot-Waypoint-Dateien

## Zweck

FH2 integriert DJI WPML als **read-only Missions-/Dateivertrag**.

WPML, Pilot-Waypoint-Dateiverwaltung und Missionsausführung bleiben getrennte Ebenen:

```text
WPML
  -> Dateiformat / Missionsbeschreibung

Pilot Waypoint Management HTTPS
  -> Inventar/Datei-IDs/Metadaten

FH2 Mission / Control
  -> Korrelation, Safety, spätere Ausführung
```

Aus einem erfolgreich gelesenen KMZ entsteht **keine** automatische
`mission.wayline`-Capability und keine Missionsfreigabe.

## WPML-Dateiformat

DJI WPML steht für Waypoint Markup Language und basiert auf KML/XML. Eine
Route wird als KMZ-Datei transportiert.

FH2 erwartet im Standardarchiv:

```text
wpmz/
  template.kml
  waylines.wpml
  res/
```

- `template.kml` beschreibt die editierbare Planungs-/Template-Ebene.
- `waylines.wpml` beschreibt die ausführbare Wayline-Ebene.
- `res/` enthält optionale Hilfsressourcen.

Der aktuelle Reader ist **read-only** und verwendet nur Node-Bordmittel.

Sicherheitsregeln:

- keine verschlüsselten ZIP-Einträge
- keine Multi-Disk-ZIPs
- keine absoluten Pfade
- kein `..` / Zip-Slip
- Größenlimits pro Eintrag und Gesamtarchiv
- keine XML-DTDs oder externen Entities
- unbekannte WPML-Felder werden nicht als Control-Semantik interpretiert

## Namespace

Verifizierte Baseline:

```text
http://www.dji.com/wpmz/1.0.2
```

Andere Namespaces werden nicht hart verworfen, sondern als Warnung markiert,
damit spätere WPML-Versionen nicht unnötig unlesbar werden.

## MissionConfig

FH2 liest unter anderem:

- `flyToWaylineMode`
- `finishAction`
- `exitOnRCLost`
- `executeRCLostAction`
- `takeOffSecurityHeight`
- `takeOffRefPoint`
- `takeOffRefPointAGLHeight`
- `globalTransitionalSpeed`
- `globalRTHHeight` in `waylines.wpml` (read-only; erzeugt keinerlei RTH-Freigabe)
- `droneInfo`
- `payloadInfo`
- optionales `autoRerouteInfo` mit
  `missionAutoRerouteMode` und `transitionalAutoRerouteMode`

### Produktidentitäten

Die WPML-Produktwerte sind ein eigener DJI-Vertrag.

Beispiele aus dem aktuellen Common-Element-Vertrag:

| WPML-Wert | Bedeutung |
| --- | --- |
| `droneEnumValue=77, sub=0` | M3E |
| `77/1` | M3T |
| `77/2` | M3M |
| `91/0` | M3D |
| `91/1` | M3TD |
| `99/0` | M4E |
| `99/1` | M4T |
| `100/0` | M4D |
| `100/1` | M4TD |
| `payloadEnumValue=66` | M3E Camera |
| `67` | M3T Camera |
| `68` | M3M Camera |
| `88` | M4E Camera |
| `89` | M4T Camera |
| `98` | M4D Camera |
| `99` | M4TD Camera |

Wichtig:

```text
WPML payloadEnumValue
  !=
Pilot payload_model_key
  !=
MQTT payload_index
```

FH2 konvertiert diese Identitäten nicht heuristisch ineinander.

Die aktuelle DJI-WPML-Dokumentation unterstützt zusätzlich M4E/M4T sowie
M4D/M4TD. Deren Werte werden aus der offiziellen Produktmatrix übernommen.
Nicht eindeutig dokumentierte zukünftige Produktwerte bleiben als unbekannt
erhalten und werden **nicht geraten**.

## Template-Ebene

FH2 liest pro `Folder`:

- `templateType`
- `templateId`
- `autoFlightSpeed`
- `waylineCoordinateSysParam.coordinateMode`
- `heightMode`
- `positioningType`
- `payloadParam.payloadPositionIndex`
- `payloadParam.imageFormat` als unveränderten Rohwert plus getrennte Liste
- Waypoints/Placemark
- ActionGroups

Dokumentierte Template-Typen umfassen derzeit unter anderem:

```text
waypoint
mapping2d
mapping3d
mappingStrip
```

Unbekannte zukünftige Werte bleiben als Rohstring erhalten.

Zusätzlich bewahrt der Parser für Dokument, MissionConfig, Folder, Waypoint,
ActionGroup und Action jeweils den zugehörigen `rawXml`-Ausschnitt auf.
Dadurch gehen noch nicht typisierte DJI-Elemente beim read-only Import nicht
verloren.

## Execution-Ebene

Aus `waylines.wpml` liest FH2:

- `templateId`
- `waylineId`
- `executeHeightMode`
- `autoFlightSpeed`
- optionale `startActionGroup`-Initialaktionen
- Waypoint-`index`
- KML-`coordinates`
- `executeHeight`
- `waypointSpeed`
- ActionGroups

`templateId` verbindet Template und Ausführungsroute innerhalb des KMZ.

## Höhenreferenzen

WPML trennt Planungs- und Ausführungshöhen ausdrücklich.

### template.kml

`heightMode` kann beispielsweise `EGM96` oder
`relativeToStartPoint` beschreiben.

### waylines.wpml

`executeHeightMode` beschreibt die tatsächliche Ausführungshöhe,
beispielsweise:

- `WGS84` – Ellipsoidhöhe
- `relativeToStartPoint`
- produktspezifisch weitere dokumentierte Modi wie `realTimeFollowSurface`

FH2 speichert diese Werte getrennt:

```text
templateHeightM
ellipsoidHeightM
executeHeightM
```

Eine EGM96-Höhe wird nicht stillschweigend als WGS84-Ellipsoidhöhe
interpretiert.

## Actions

FH2 extrahiert:

- `actionGroupId`
- Start-/End-Waypoint
- `actionGroupMode`
- `actionTriggerType`
- `actionTriggerParam`
- `actionId`
- `actionActuatorFunc`
- einfache `actionActuatorFuncParam`-Felder

Dokumentierte Trigger umfassen:

- `reachPoint`
- `betweenAdjacentPoints`
- `multipleTiming`
- `multipleDistance`

Dokumentierte Actions umfassen unter anderem:

- `takePhoto`
- `startRecord`
- `stopRecord`
- `focus`
- `zoom`
- `customDirName`
- `gimbalRotate`
- `rotateYaw`
- `hover`
- `gimbalEvenlyRotate`
- `accurateShoot`
- `orientedShoot`
- `panoShot`
- `recordPointCloud`

Der Parser führt eine strukturelle Validierung durch, aber **führt keine Action
aus**.

## M3M und Lens-/Bildformat

DJI WPML unterscheidet bei Bildformat-/Lens-Feldern unter anderem:

```text
wide
zoom
ir
narrow_band
visible
visable
```

Die offizielle Dokumentation enthält je nach Feld/Sprachstand sowohl
`visible` als auch die historische Schreibweise `visable`.

FH2 normalisiert diese Werte aktuell **nicht stillschweigend**, sondern erhält
den DJI-Rohwert. Dadurch bleibt nachvollziehbar, was tatsächlich in der
Wayline-Datei stand.

## Validierung

Aktuell geprüft werden unter anderem:

- sichere XML-Struktur ohne DTD/Entity
- vorhandenes `missionConfig`
- vorhandene Folder
- nicht-negative `templateId` / `waylineId`
- eindeutige `waylineId`
- `templateId`-Referenz zwischen beiden Dokumenten
- konsistente `droneInfo` / `payloadInfo`
- gültige Waypoint-Koordinaten
- eindeutige Waypoint-Indizes pro Folder
- Waypoint-Indizes monoton und lückenlos ab `0`
- erforderliches `globalRTHHeight` in `waylines.wpml` und DJI-Bereich `[2,1500]` m
- `takeOffSecurityHeight` mindestens `1.2` m für RC-Routen; Dock-Routen können produktspezifisch mindestens `8` m verlangen
- eindeutige `templateId` innerhalb von `template.kml`
- `actionTriggerParam > 0` bei `multipleTiming` / `multipleDistance`
- ActionGroup-ID-Bereich `[0,65535]`
- ActionGroup-ID-Eindeutigkeit im Dokument
- `endIndex >= startIndex`
- vorhandener Action-Trigger
- Action-ID-Eindeutigkeit innerhalb einer ActionGroup
- vorhandener `actionActuatorFunc`

Das ist keine vollständige XSD-/Business-Regel-Validierung aller
produktspezifischen DJI-Grenzen.

## Projektion ins FH2-Missionsmodell

Ein WPML-KMZ kann über `importWpmlKmzToGroundStation()` in einem
read-only Schritt entpackt, validiert, geparst und anschließend in die
herstellerneutralen FH2-Typen projiziert werden. Alternativ kann ein bereits
geparstes Bundle über `projectWpmlToGroundStation()` projiziert werden:

```text
WpmlBundle
  -> GroundStationMission
  -> GroundStationRoute[]
  -> MissionExternalReference[]
```

Die stabile Import-/Datei-ID wird vom aufrufenden Pfad vorgegeben. FH2
erfindet keine externe Wayline-ID.

Für jede `waylines.wpml`-Folder entsteht eine neutrale Route. Dabei gilt für
die Höhe strikt:

```text
executeHeightMode = WGS84
  -> executeHeight darf als GroundStationGeoPoint.altitudeM erscheinen

executeHeightMode = relativeToStartPoint
oder realTimeFollowSurface
  -> executeHeight bleibt WPML-Metadatum
  -> keine Umdeutung in altitudeM oder aglAltitudeM
```

Damit bleibt die DJI-Höhenreferenz erhalten und eine relative bzw.
oberflächenbezogene Höhe wird nicht fälschlich als Ellipsoidhöhe behandelt.

Die erzeugten `MissionExternalReference`-Einträge verwenden
`source=dji_wpml`. Ihre zusammengesetzte FH2-Referenz ist `derived`, weil
sie aus der vom Importpfad gelieferten stabilen Datei-ID plus dem internen
WPML-`waylineId` gebildet wird.

Diese Projektion ist ausschließlich lesend. Sie erzeugt weder Upload- noch
Execution-Rechte.

## Pilot-to-Cloud Waypoint Management

Separat zum KMZ-Parser unterstützt FH2 read-only:

```http
GET /wayline/api/v1/workspaces/{workspace_id}/waylines
x-auth-token: <serverseitiges Secret>
```

DJI dokumentiert beziehungsweise verwendet im offiziellen Cloud-API-Demo
folgende Filter:

- `key` – Wayline-Dateiname
- `favorited`
- `order_by`
- `page`
- `page_size`
- `template_type[]`
- `action_type`
- `drone_model_keys[]`
- `payload_model_key[]`

Das offizielle DJI-Cloud-API-Demo bindet die Arrayfelder als Java-`List`
über Spring `@ParameterObject`. FH2 verwendet dafür wiederholte
Queryparameter und bleibt damit zum Referenzserver-Vertrag kompatibel.
Die reale Pilot-2-Laufzeit wird trotzdem als Hardware-/Integrationsnachweis
offengehalten.

Lokale Integer-Queryparameter werden strikt als vollständige Dezimalzahlen
validiert. Werte wie `page=2foo` oder `page_size=25.5` werden nicht
teilweise geparst, sondern abgewiesen.

Der DJI-Demo-Vertrag wird zusätzlich fail-closed eingegrenzt:

```text
template_type: 0=waypoint, 1=mapping2d, 2=mapping3d, 3=mappingStrip
action_type:   1=AI Spot-Check
order_by:      name asc|desc
               update_time asc|desc
               create_time asc|desc
page_size:     Standard 10
```

Andere Werte werden lokal mit `400 invalid_query_*` abgewiesen.

## Pilot-Katalogmodell

FH2 normalisiert:

- Waypoint-Datei-ID
- Name
- `drone_model_key`
- `payload_model_keys[]`
- `template_types[]`
- `action_type`
- Favorit
- Updatezeit
- Benutzername
- Startpunkt
- Pagination

DJIs veröffentlichte Response verwendet aktuell:

```text
start_lontitude
```

FH2 akzeptiert diesen dokumentierten Schlüssel und zusätzlich
`start_longitude`, falls DJI die Schreibweise korrigiert. Intern lautet das
Feld immer `longitude`.

### Identitätsgrenze

Beispiel aus der DJI-API:

```text
drone_model_key   = 0-67-0
payload_model_key = 1-53-0
```

Diese Produktkeys dürfen nicht als MQTT-`payload_index` interpretiert werden.

## FH2 öffentliche Read-API

Wenn serverseitig konfiguriert:

```http
GET /api/dji/pilot/waylines/status
GET /api/dji/pilot/waylines
```

Unterstützte lokale Queryparameter entsprechen dem DJI-Katalogvertrag.

Der Browser erhält niemals den `x-auth-token`.

Eine vorhandene Pilot-Wayline-ID wird als:

```json
{
  "kind": "wayline",
  "source": "dji_pilot_wayline",
  "confidence": "authoritative"
}
```

mit dem bestehenden `MissionExternalReference`-Vertrag korreliert.

## Nicht implementiert / bewusst gesperrt

Aktuell **nicht** freigegeben:

- Wayline-Upload
- STS-Credentials
- Download-URL-Fetch/Proxy
- Collect/Cancel-Collect
- Wayline-Ausführung
- automatische `mission.wayline`-Capability
- automatische Umwandlung UgCS -> WPML
- automatische Umwandlung FH2 -> WPML
- schreibender WPML-Generator

Die DJI-STS-API liefert temporäre Storage-Credentials. FH2 ruft sie in
diesem read-only Stand bewusst nicht ab und exponiert sie niemals an Browser.

## Offizielle DJI-Referenzen

- WPML Overview:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/overview.html
- Common Elements:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/common-element.html
- template.kml:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html
- waylines.wpml:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/waylines-wpml.html
- Pilot Waypoint File List:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/https/waypoint-management/obtain-waypointfile-list.html
