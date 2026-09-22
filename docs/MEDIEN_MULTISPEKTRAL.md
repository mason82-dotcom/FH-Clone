# Medien und Multispektral

## Status

Dieses Dokument beschreibt den verbindlichen V3-Fachrahmen.

Die physikalische Banddefinition, die DJI-M3M-EXIF/XMP-Feldnamen und die
fachliche Media-/NDVI-Zuordnung sind inzwischen herstellerseitig dokumentiert.
Offen bleibt die Verifikation an realen M3M-Dateien sowie die konkrete
Cloud-API-Payload-Zuordnung, falls sie für den Runtime-Pfad benötigt wird.

## Ziel

FH2 soll RGB-, Thermal- und Multispektralmedien einheitlich beschreiben, ohne
produktspezifische Annahmen in den Aircraft Core einzubauen.

## V3-Domänenobjekte

### MediaAsset

Beschreibt eine konkrete Mediendatei beziehungsweise ein Medienobjekt.

Mindestens fachlich relevant:

- eindeutige Asset-ID
- Dateiname oder Object-Key
- Aufnahmezeit
- Gerätebezug
- Sensor-/Payload-Bezug
- Position
- Missionsbezug
- Medienart
- Verarbeitungsstatus

### SensorSource

Beschreibt die tatsächliche Sensorquelle.

Beispiele:

- RGB
- Thermal
- multispektraler Einzelsensor
- unbekannte/noch nicht klassifizierte Quelle

Die Sensorquelle darf nicht allein aus einem sichtbaren Anzeigenamen geraten
werden.

### SpectralBand

Beschreibt ein eindeutig identifiziertes Spektralband.

Für M3M fachlich relevant:

```text
Green
Red
Red Edge
NIR
RGB
```

Bandidentität muss aus einer belastbaren Quelle stammen.

### CaptureContext

Verknüpft die Aufnahme mit dem Flugkontext.

Fachlich relevante Informationen:

- `device_sn`
- Gateway-/Payload-Bezug
- Aufnahmezeit
- Position
- RTK-Status
- relative/ellipsoidische Höhe
- Aircraft-Pose
- Gimbal-Pose
- Mission/Task
- Sensorquelle

### ProcessingProfile

V3-Pflichtprofile:

```text
GENERIC
RGB
THERMAL
MULTISPECTRAL
NDVI
```

## Quellenklassifikation

Jede fachliche Zuordnung wird als eine der folgenden Klassen gespeichert oder
behandelt:

### authoritative

Direkte, vertrauenswürdige Quelle.

Beispiele:

- explizites Sensor-/Bandfeld aus Hersteller-Metadaten
- eindeutige API-/XMP-/EXIF-Zuordnung

### derived

Deterministisch aus authoritative Daten abgeleitet.

### heuristic

Nur heuristisch zugeordnet.

Heuristische Informationen dürfen nicht stillschweigend als authoritative
persistiert werden.

### unavailable

Für den aktuellen Datensatz nicht verfügbar.

## Kamera-/Payload-Felder

Zu verifizieren beziehungsweise zu normalisieren:

- Payload-Identität
- Kamera-/Sensor-Identität
- Lens-/Video-Quelle
- ISO
- Verschlusszeit
- Belichtung
- Brennweite/FOV
- Zoom
- Thermal-/IR-Quelle
- Gimbal Pitch/Roll/Yaw
- Capture-/Recording-Status
- Speicher-/Medienstatus

Unbekannte DJI-Felder bleiben als Rohdaten erhalten.

## M3M-Fachvertrag

### Herstellerseitig authoritative bestätigt

DJI dokumentiert für die Mavic 3 Multispectral zwei Kamerasysteme:

- RGB: 4/3-CMOS, 20 MP, JPEG/DNG
- Multispektral: 1/2,8-Zoll-CMOS, 5 MP je Band, TIFF

Die vier Multispektralbänder sind authoritative definiert:

| FH2-Band | DJI-Bezeichnung | Zentrum | Halbbreite/Toleranz | Quelle | Vertrauensklasse |
| --- | --- | ---: | ---: | --- | --- |
| GREEN | Green (G) | 560 nm | ±16 nm | DJI Mavic 3M Specs | authoritative |
| RED | Red (R) | 650 nm | ±16 nm | DJI Mavic 3M Specs | authoritative |
| RED_EDGE | Red Edge (RE) | 730 nm | ±16 nm | DJI Mavic 3M Specs | authoritative |
| NIR | Near Infrared (NIR) | 860 nm | ±26 nm | DJI Mavic 3M Specs | authoritative |
| RGB | Visible/RGB | – | – | DJI Mavic 3M Specs | authoritative |

DJI WPML führt M3M als unterstütztes Produkt und unterscheidet für
Bildspeicherung unter anderem `narrow_band` und `visible`. Diese Information
ist für die **Sensor-/Medienklasse** authoritative, reicht jedoch alleine
nicht aus, um eine konkrete TIFF-Datei einem der vier Einzelbänder
zuzuordnen.

### Cloud-API-Kameraeigenschaften

Für die in der Pilot-to-Cloud-Produktmatrix unterstützten M3-Enterprise-
Geräte liefert die Cloud API im `cameras`-Array unter anderem:

- `payload_index`
- `camera_mode`
- `photo_state`
- `recording_state`
- `remain_photo_num`
- `remain_record_duration`
- `record_time`
- `zoom_factor`
- `ir_zoom_factor`, sofern für das konkrete Produkt relevant

`payload_index` hat allgemein das DJI-Format:

```text
{type-subtype-gimbalindex}
```

Diese Kameraeigenschaften sind **kein Nachweis**, dass M3M am aktuellen
Pilot-to-Cloud-Live-Runtime-Pfad teilnimmt.

Für V3 wird **kein exakter M3M-`payload_index` in den statischen
FH2-Payload-Registry-Code aufgenommen**, solange dieser Wert nicht aus einer
eindeutigen offiziellen Produkt-Support-Enumeration oder realer Hardware
bestätigt ist.

Insbesondere wird aus einer WPML-Payload-Type-Enumeration kein
`type-subtype-gimbalindex` geraten.

### Offizieller M3M-EXIF/XMP-Vertrag

DJIs `Mavic 3M Image Processing Guide` dokumentiert für M3M-Aufnahmen
konkrete EXIF- und XMP-Felder. Diese Feldnamen gelten für V3 als
**authoritative Herstellerquelle**.

| DJI-Metadatenfeld | Bedeutung | FH2-Verwendung | Vertrauensklasse |
| --- | --- | --- | --- |
| `ImageSource` | Kamera-/Bildquelle, z. B. `MS_NIR_CAMERA` | Sensorquelle | authoritative |
| `BandName` | `Green` / `Red` / `RedEdge` / `NIR` | `SpectralBand.name` | authoritative |
| `BandFreq` | zentrale Wellenlänge + Halbbreite | `centerNm` / `toleranceNm` | authoritative |
| `SensorIndex` | Green=1, Red=2, RedEdge=3, NIR=4 | Konsistenzprüfung | authoritative |
| `CaptureUUID` | UUID V4 einer Aufnahme | primärer Capture-Set-Schlüssel | authoritative |
| `UTCAtExposure` | UTC-Zeitpunkt der Belichtung | Aufnahmezeit | authoritative |
| `GPSDateStamp` / `GPSTimeStamp` | GPS-Aufnahmezeit | Zeit-Quervergleich | authoritative |
| `GpsLatitude` / `GpsLongitude` | Aufnahmeposition | CaptureContext | authoritative |
| `AbsoluteAltitude` / `RelativeAltitude` | absolute/relative Höhe | CaptureContext | authoritative |
| `GpsStatus` / `RtkFlag` | GNSS-/RTK-Status | CaptureContext/Qualität | authoritative |
| `GimbalRollDegree` / `GimbalPitchDegree` / `GimbalYawDegree` | Gimbal-Pose | CaptureContext | authoritative |
| `FlightRollDegree` / `FlightPitchDegree` / `FlightYawDegree` | Aircraft-Pose | CaptureContext | authoritative |
| `Irradiance` | kompensierter Sonnenlichtsensorwert | radiometrische Verarbeitung | authoritative |
| `LS_status` | Status des Sonnenlichtsensors | Radiometrie-Gültigkeit | authoritative |
| `RawData` | Sonnenlichtsensor-Rohwerte in Reihenfolge Green/Red/RedEdge/NIR | Diagnose/Kalibrierung | authoritative |
| `SensorGain` | Gain des Multispektralsensors | Radiometrie | authoritative |
| `SensorGainAdjustment` | Gain-Kompensation relativ zum Standard-NIR-Modul | Radiometrie | authoritative |
| `ExposureTime` | Belichtungszeit des Multispektralsensors | Radiometrie | authoritative |
| `BlackLevel` / `BlackCurrent` | Schwarzpegel | Radiometrie | authoritative |
| `VignettingData` | Vignettierungskoeffizienten | Bildkorrektur | authoritative |
| `DewarpData` | intrinsische Kamera-/Verzeichnungsparameter | Bildkorrektur | authoritative |
| `CalibratedHMatrix` | projektive Transformationsmatrix | Band-Ausrichtung | authoritative |
| `CameraSerialNumber` | Kameraseriennummer | Sensor-/Asset-Korrelation | authoritative |
| `DroneSerialNumber` / `DroneID` | Aircraft-Seriennummer | `device_sn`-Abgleich | authoritative |

Die exakte Schreibweise im Dateiparser muss den ursprünglichen
`drone-dji`-Namespace und den Rohschlüssel erhalten. Ein Parser darf aus
Darstellungsvarianten wie Leerzeichen oder CamelCase **keine neue Semantik
erfinden**.

### Capture-Set-Korrelation

Für M3M ist `CaptureUUID` der bevorzugte authoritative Schlüssel zur
Gruppierung der gleichzeitig aufgenommenen Dateien. DJI bestätigt außerdem,
dass die fünf Kameras zeitlich synchronisiert sind.

Damit gilt für V3:

```text
gleiche CaptureUUID
  -> gleicher Capture-Satz
  -> RGB + G + R + RE + NIR nach vorhandenen authoritative Bandfeldern
```

Zeitstempel, Position und Pose dienen als Konsistenzprüfung beziehungsweise als
`derived`-Fallback, nicht als Ersatz für eine vorhandene `CaptureUUID`.

### Radiometrische NDVI-Voraussetzung

Die M3M-TIFFs dürfen nicht allein aufgrund vorhandener Red-/NIR-Dateien direkt
als radiometrisch verarbeitungsfertig gelten. DJI beschreibt vor der
NDVI-Berechnung mindestens:

1. Vignettierungskorrektur,
2. Verzeichnungskorrektur,
3. geometrische Band-Ausrichtung,
4. Ausgleich von Belichtungsunterschieden,
5. Sonnenlichtsensor-/Gain-Kompensation.

`radiometricallySuitable=true` darf in FH2 deshalb erst gesetzt werden, wenn
der gewählte Verarbeitungsweg die für den Datensatz erforderlichen
Korrektur-/Kalibrierungsinformationen erfolgreich angewandt beziehungsweise
explizit validiert hat.

### DJI-Adapter-Metadatenmapper

Der V3-Kandidat enthält im DJI-Adapter einen dependency-freien Mapper:

```text
normalizeDjiM3mMediaMetadata()
```

Er nimmt bereits extrahierte EXIF-/XMP-Metadaten als
`Record<string, unknown>` entgegen und bildet ausschließlich dokumentierte
DJI-M3M-Felder auf die herstellerneutralen Core-Typen ab.

Abgebildet werden unter anderem:

- `BandName` -> authoritative `SpectralBand` und erst dann Profil
  `MULTISPECTRAL`
- ohne dokumentiertes `BandName` bleibt das Asset fail-safe
  `GENERIC/unknown`; insbesondere wird ein M3M-RGB-Bild nicht als
  Narrow-Band geraten
- `BandFreq`, `CentralWavelength` und `SensorIndex` ->
  Konsistenzprüfung der Bandidentität
- `CaptureUUID` -> authoritative Capture-Set-Korrelation
- `UTCAtExposure` -> Aufnahmezeit
- GPS/Höhe/Aircraft-/Gimbal-Pose -> `CaptureContext`
- `RtkFlag` -> RTK-Fixinformation
- Sonnenlichtsensor-/Gain-/Exposure-/Kalibrierungsfelder ->
  Radiometrie-Metadaten

Der Mapper:

- liest **keine** TIFF-/JPEG-Dateien selbst,
- führt **keine** EXIF-/XMP-Bibliothek ein,
- rät kein Band aus Dateiname, Dateireihenfolge oder `SensorIndex`,
- meldet widersprüchliche `BandName`-/`BandFreq`-/`CentralWavelength`-/
  `SensorIndex`-Angaben als Konflikt,
- bewahrt die vollständigen Rohmetadaten am `MediaAsset`.

Die konkrete Parserbibliothek beziehungsweise Import-Pipeline bleibt außerhalb
dieses Gate-5-Mappers. Reale Fixtures müssen zuerst zeigen, in welcher
Namespace-/Tagdarstellung die verwendete Toolchain die DJI-Felder liefert.

### Noch real dateiseitig zu verifizieren

Vor V3-RC müssen reale M3M-Dateien nur noch bestätigen:

- dass die dokumentierten DJI-Felder in der tatsächlich verwendeten
  Firmware-/Aufnahmekonfiguration vorhanden und vom gewählten Parser lesbar
  sind,
- dass alle Dateien eines realen Capture-Satzes dieselbe `CaptureUUID`
  tragen,
- dass `BandName`, `BandFreq` und `SensorIndex` widerspruchsfrei sind,
- dass Sonnenlichtsensor-/Kalibrierungswerte in realen Fixtures plausibel
  vorliegen,
- wie fehlende/ungültige Felder bei beschädigten oder unvollständigen
  Datensätzen aussehen.

Eine einzelne Datei darf weiterhin **nicht** allein anhand von Dateiname,
Reihenfolge oder Produktname als RED/NIR/GREEN/RED_EDGE markiert werden.

## Media-Korrelation

Zielbeziehung:

```text
MediaAsset
 -> device_sn
 -> SensorSource
 -> Payload
 -> CaptureTime
 -> Position
 -> Mission/Task
 -> SpectralBand
 -> ProcessingProfile
```

Für jede Kante wird die Vertrauensklasse gespeichert:

- `authoritative`
- `derived`
- `heuristic`
- `unavailable`

### Verbindliche Korrelationsmatrix

| Beziehung | Bevorzugte Quelle | Fallback | V3-Regel |
| --- | --- | --- | --- |
| Asset -> device_sn | DJI-Medienmetadaten/EXIF/XMP mit eindeutiger Gerätekennung | Missionskontext | Fallback höchstens derived |
| Asset -> CaptureTime | originaler Aufnahmezeitstempel | Dateisystemzeit | Dateisystemzeit niemals authoritative |
| Asset -> Position | eingebettete GNSS-/RTK-Metadaten | Missions-/Telemetry-Snapshot | Snapshot derived, Zeitabweichung dokumentieren |
| Asset -> Mission | aktive Mission + Zeitfenster + device_sn | – | derived, sofern keine direkte Task-ID vorliegt |
| Asset -> Payload | explizite Payload-/Sensor-ID | Produktkontext | Produktkontext allein höchstens heuristic |
| Asset -> SpectralBand | explizites DJI-/EXIF-/XMP-Bandfeld | – | kein Dateiname-/Reihenfolge-Fallback als authoritative |
| Assets -> CaptureSet | `CaptureUUID` | device + enger Zeitbezug + Pose | `CaptureUUID` authoritative; Fallback höchstens derived/heuristic |
| CaptureSet -> ProcessingProfile | validierte Sensor-/Bandmenge | GENERIC | Profil darf Vertrauensklasse nicht erhöhen |

### Konfliktpriorität

Bei widersprüchlichen Quellen gilt:

```text
authoritative
  > derived
  > heuristic
  > unavailable
```

Zwei widersprüchliche authoritative Quellen werden **nicht** automatisch
aufgelöst. Der Datensatz erhält einen Konfliktstatus und bleibt für NDVI
gesperrt.

## Konfliktregeln

### Unterschiedliche Zeitstempel

API-, EXIF- und XMP-Zeitstempel dürfen nicht still überschrieben werden.

Es braucht:

- Quelle
- Originalwert
- normalisierten Wert
- Konfliktstatus

### Fehlende Payload-ID

Keine frei erfundene Payload-Zuordnung.

### Dateiname widerspricht Metadaten

Metadaten mit höherer Vertrauensklasse haben Vorrang vor
Dateinamen-Heuristiken.

### Mehrere Bänder mit gleichem Zeitpunkt

Als zusammengehöriger Capture-Satz nur gruppieren, wenn die Korrelation
deterministisch genug ist.

## NDVI-Regeln

Grundformel:

```text
NDVI = (NIR - Red) / (NIR + Red)
```

Die Formel allein genügt nicht für einen gültigen Workflow.

### NDVI_READY

Nur wenn **alle** Bedingungen erfüllt sind:

- Red authoritative identifiziert
- NIR authoritative identifiziert
- Red und NIR gehören nach authoritative/derived Korrelation zum selben
  Capture-Kontext
- keine widersprüchliche Bandquelle
- Georeferenzierung vorhanden oder für den konkreten Verarbeitungsschritt
  ausdrücklich nicht erforderlich
- Aufnahme-/Sensorbezug konsistent
- beide Eingangsdaten sind numerisch/radiometrisch für die geplante
  Verarbeitung geeignet

### NDVI_PARTIAL

Wenn der Datensatz M3M/multispektral ist und Red/NIR prinzipiell erwartet
werden, aber mindestens eine notwendige Identität, Korrelation oder
Kalibrierungsinformation fehlt beziehungsweise nur heuristic ist.

`NDVI_PARTIAL` darf nicht automatisch verarbeitet werden.

### NOT_NDVI_CAPABLE

Wenn mindestens eine dieser Bedingungen gilt:

- Red fehlt nachweislich,
- NIR fehlt nachweislich,
- Quelle ist kein multispektraler Datensatz,
- die vorhandenen Medien können nicht ausreichend eindeutig als Red/NIR
  identifiziert werden und es gibt keinen sicheren Nachlieferungspfad.

### Statusautomat

```text
unbekannt / GENERIC
      |
      +-- multispektrale Quelle erkannt
      |       |
      |       +-- Red/NIR unvollständig/unsicher -> NDVI_PARTIAL
      |       |
      |       +-- Red + NIR authoritative
      |               + Korrelation gültig
      |               + keine Konflikte
      |               -> NDVI_READY
      |
      +-- Quelle ohne geeignete Red/NIR-Bänder -> NOT_NDVI_CAPABLE
```

Kein Status darf allein aus Dateiendung oder Dateiname auf
`NDVI_READY` angehoben werden.

## Thermal

Thermal wird als eigenes ProcessingProfile geführt.

Thermal- und RGB-Daten dürfen nicht allein wegen gleicher Kamera/Payload-ID
als identische Sensorquelle behandelt werden.

Radiometrische Thermal-Daten müssen von reinen Thermal-Visualisierungen
unterschieden werden, sofern die Quelle dies ermöglicht.

## RTK-Bezug

Media-Metadaten dürfen einen RTK-Snapshot oder RTK-Kontext übernehmen.

Keine NTRIP-Credentials in Media-Metadaten.

Siehe [RTK_NTRIP.md](RTK_NTRIP.md).

## Persistenz

V3 soll mindestens speichern können:

- Originalmetadaten
- normalisierte Media-Metadaten
- Quellenklassifikation
- Sensor-/Bandzuordnung
- Konfliktstatus
- Missionsbezug
- ProcessingProfile
- Validierungsstatus

## Hardware-/Fixture-Abnahme vor V3-RC

Für Gate 5 müssen reale M3M-Dateien mindestens folgende Testfälle abdecken:

1. ein vollständiger RGB + G + R + RE + NIR Capture-Satz,
2. fehlendes Red-Band,
3. fehlendes NIR-Band,
4. widersprüchliche Bandmetadaten,
5. gleiche/nahe Zeitstempel aus mehreren Capture-Sätzen,
6. RTK-Fix vorhanden,
7. RTK-Fix nicht vorhanden,
8. fehlende Payload-/Sensor-ID,
9. Datei mit nur heuristisch erkennbarem Band,
10. Neustart/Import desselben Datensatzes ohne doppelte Asset-Erzeugung.

Erwartete Statusbeispiele:

| Test | Erwartung |
| --- | --- |
| Red + NIR authoritative, Capture-Satz eindeutig | NDVI_READY |
| Red oder NIR fehlt, M3M-Datensatz | NDVI_PARTIAL |
| Band nur aus Dateiname geraten | NDVI_PARTIAL |
| widersprüchliche authoritative Bandangaben | NDVI_PARTIAL + Konflikt |
| RGB-only | NOT_NDVI_CAPABLE |

## Noch offen vor V3-RC

- reale Hardwarefixtures gegen den dokumentierten EXIF/XMP-Vertrag
- parserseitige Verifikation der konkreten Namespace-/Tag-Darstellung
- endgültige kanonische Normalisierungskeys für diese Dateifelder
- Persistenzschema für MediaAsset/SensorSource/SpectralBand/CaptureContext
- reale Ausführung der vorhandenen NDVI-Validierungstests nach R1
- exakter M3M-Cloud-`payload_index`, sofern er im Runtime-Pfad benötigt wird

Die **physikalische M3M-Banddefinition und NDVI-Entscheidungsregeln sind
damit fachlich festgelegt**. Offen bleibt die konkrete Datei-/API-Zuordnung,
nicht die Bedeutung der Bänder.

Bis diese Punkte geschlossen sind, darf FH2 keine unbestätigten
Multispektralwerte erfinden.
