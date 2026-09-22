# DJI WPML

## Status

FH2 besitzt einen ersten lesenden WPML-Pfad für `template.kml`.

Implementiert sind:

- sicherer, dependency-freier XML-Reader
- Namespace-Auflösung anhand der Namespace-URI
- KML-2.2-Root und `Document`
- DJI-`wpml:missionConfig`
- `wpml:droneInfo`
- `wpml:payloadInfo`
- Unit- und Regressionstests für XML-Sicherheit, Namespaces und MissionConfig

Nicht implementiert sind in diesem Schritt:

- `Folder`-/Waypoint-Modell
- Action-Groups
- Erzeugung von `waylines.wpml`
- KMZ-Packaging
- Upload oder Start einer Wayline
- neue `mission.wayline`-Execution-Capability

Damit bleibt die Integration lesend und ändert die bestehende FC2-/Safety-Grenze
nicht.

## Herstellervertrag

DJI WPML verwendet für `template.kml`:

```xml
<kml
  xmlns="http://www.opengis.net/kml/2.2"
  xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    ...
  </Document>
</kml>
```

Der Parser bindet die DJI-Felder **nicht** an den Textpräfix `wpml`.
Auch ein anderes Präfix ist zulässig, solange es auf dieselbe DJI-Namespace-URI
aufgelöst wird.

Beispiel:

```xml
<kml
  xmlns="http://www.opengis.net/kml/2.2"
  xmlns:dji="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <dji:missionConfig>...</dji:missionConfig>
  </Document>
</kml>
```

## XML-Sicherheitsregeln

Der Reader führt keine DTD- oder Entity-Auflösung durch.

Explizit abgelehnt werden:

- `DOCTYPE`
- `ENTITY`
- sonstige XML-Deklarationen über `<!...>`
- nicht deklarierte Namespace-Präfixe
- benutzerdefinierte Entity-Referenzen
- nicht-XML Processing Instructions
- mehrere Root-Elemente
- falsch geschlossene Elemente

Erlaubt sind nur:

- die fünf eingebauten XML-Entities
- numerische Zeichenreferenzen
- Kommentare
- CDATA innerhalb eines Elements

Zusätzlich gelten feste Limits für:

- Eingabegröße
- Verschachtelungstiefe
- Elementanzahl
- Attribute pro Element

Damit wird insbesondere keine XXE-/externe Entity-Verarbeitung angeboten.

## `Document`

Aktuell werden aus dem DJI-Namespace gelesen:

```text
author
createTime
updateTime
missionConfig
```

`createTime` und `updateTime` bleiben Millisekunden seit Unix-Epoch gemäß
DJI-Vertrag.

Unbekannte zusätzliche `Document`-Felder blockieren den Reader nicht.

## `missionConfig`

Aktuell typisiert:

```text
flyToWaylineMode
finishAction
exitOnRCLost
executeRCLostAction
takeOffSecurityHeight
takeOffRefPoint
takeOffRefPointAGLHeight
globalTransitionalSpeed
droneInfo
payloadInfo
```

Die Einheiten werden im FH2-Typnamen sichtbar gemacht:

```text
takeOffSecurityHeightM
takeOffRefPointAglHeightM
globalTransitionalSpeedMps
latitudeDeg
longitudeDeg
ellipsoidHeightM
```

`takeOffRefPoint` wird entsprechend DJI als

```text
latitude,longitude,altitude
```

interpretiert.

## `droneInfo`

Gelesen werden:

```text
droneEnumValue
droneSubEnumValue
```

Die numerischen DJI-Enums werden im Parser absichtlich **nicht** auf eine feste
Produktliste begrenzt. Die WPML-Spezifikation wird um neue Aircraft erweitert;
Produktsemantik gehört deshalb in eine separate Produktmatrix und nicht in den
XML-Leser.

So kann der Reader auch neue DJI-Enums sicher einlesen, ohne daraus automatisch
eine Capability abzuleiten.

## `payloadInfo`

Gelesen werden:

```text
payloadEnumValue
payloadPositionIndex
```

`payloadPositionIndex` wird auf die von DJI dokumentierten Montagepositionen
`0..2` begrenzt.

Auch `payloadEnumValue` bleibt ein Hersteller-Integer und wird nicht mit
MQTT-`payload_index` gleichgesetzt.

## Safety- und Missionsgrenze

`template.kml` beschreibt eine Planungs-/Template-Ebene.

Daraus folgt in FH2 ausdrücklich nicht:

```text
WPML-Datei erfolgreich gelesen
  !=
Wayline ausführbar
  !=
mission.wayline freigegeben
```

Die spätere ausführbare Ebene `waylines.wpml`, KMZ-Handling,
Produktkompatibilität sowie Upload/Start bleiben eigene Arbeitspakete und
unterliegen weiterhin dem zentralen Safety-/Authority-Pfad.

## Herstellerreferenzen

- DJI WPML `template.kml`:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html
- DJI WPML Common Elements:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/common-element.html
- DJI WPML `waylines.wpml`:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/waylines-wpml.html
