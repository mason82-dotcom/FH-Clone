# Medien und Multispektral

## Status

Dieses Dokument beschreibt den verbindlichen V3-Fachrahmen.

Die vollständige Feld-/Quellenmatrix aus dem Multispektral-Arbeitspaket ist
noch ein offenes V3-Gate. Daher werden hier keine unbestätigten DJI-Felder als
bereits verfügbar dargestellt.

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

Die M3-Series-Cloud-API liefert im `cameras`-Array unter anderem:

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

Für V3 wird **kein exakter M3M-`payload_index` in den statischen
FH2-Payload-Registry-Code aufgenommen**, solange dieser Wert nicht aus einer
eindeutigen offiziellen Produkt-Support-Enumeration oder realer Hardware
bestätigt ist.

Insbesondere wird aus einer WPML-Payload-Type-Enumeration kein
`type-subtype-gimbalindex` geraten.

### Noch real beziehungsweise dateiseitig zu verifizieren

Vor einer automatischen Bandzuordnung müssen reale M3M-Mediendateien oder
eindeutige DJI-Metadaten bestätigen:

- welches EXIF-/XMP-/Media-Feld das konkrete Einzelband authoritative benennt,
- wie RGB und Narrow-Band-Dateien eines Capture-Satzes eindeutig korreliert
  werden,
- welche Irradiance-/Sonnensensorfelder tatsächlich in den Dateien vorliegen,
- welche radiometrischen Kalibrierungsfelder verfügbar sind,
- wie RTK/GPS, Aufnahmezeit, Aircraft-Pose und Gimbal-Pose in den
  Medienmetadaten repräsentiert werden.

Bis dahin darf FH2 zwar einen Datensatz als **M3M/multispektral** erkennen,
aber keine einzelne Datei allein anhand von Dateiname, Reihenfolge oder
Produktname als RED/NIR/GREEN/RED_EDGE markieren.

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
| Assets -> CaptureSet | eindeutiger DJI-Capture-Identifier | device + enger Zeitbezug + Pose | heuristische Gruppe bleibt als solche markiert |
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

- tatsächliche DJI-Media-/EXIF-/XMP-Feldnamen an realen M3M-Dateien
- reale Hardwarefixtures
- endgültige kanonische Normalisierungskeys für diese Dateifelder
- Persistenzschema für MediaAsset/SensorSource/SpectralBand/CaptureContext
- automatisierte NDVI-Validierungstests
- exakter M3M-Cloud-`payload_index`, sofern er im Runtime-Pfad benötigt wird

Die **physikalische M3M-Banddefinition und NDVI-Entscheidungsregeln sind
damit fachlich festgelegt**. Offen bleibt die konkrete Datei-/API-Zuordnung,
nicht die Bedeutung der Bänder.

Bis diese Punkte geschlossen sind, darf FH2 keine unbestätigten
Multispektralwerte erfinden.
