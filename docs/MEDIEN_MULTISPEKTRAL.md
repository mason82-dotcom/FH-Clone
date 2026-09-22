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

Vor V3-Freigabe müssen insbesondere geklärt sein:

- eindeutige Identifikation von Green
- eindeutige Identifikation von Red
- eindeutige Identifikation von Red Edge
- eindeutige Identifikation von NIR
- RGB-Bezug
- Wellenlängeninformation, sofern verfügbar
- Irradiance-/Sonnensensorinformationen
- radiometrische Kalibrierungsdaten
- RTK/GPS
- Aufnahmezeit
- Aircraft-/Gimbal-Pose

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

Für jede Kante muss bekannt sein, ob sie:

- authoritative
- derived
- heuristic
- unavailable

ist.

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

Nur wenn mindestens:

- Red authoritative identifiziert
- NIR authoritative identifiziert
- beide Assets zuverlässig korreliert
- Georeferenzierung ausreichend
- Aufnahme-/Sensorbezug konsistent

### NDVI_PARTIAL

Wenn der Datensatz grundsätzlich multispektral ist, aber mindestens eine
notwendige Information fehlt oder unsicher ist.

### NOT_NDVI_CAPABLE

Wenn Red/NIR nicht vorhanden oder nicht verlässlich identifizierbar sind.

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

## Noch offen vor V3-RC

- vollständige M3M-Feld-/Quellenmatrix
- tatsächliche DJI-Media-/EXIF-/XMP-Pfade
- reale Hardwarefixtures
- endgültige Normalisierungskeys
- Persistenzschema
- automatisierte NDVI-Validierungstests

Bis diese Punkte geschlossen sind, darf FH2 keine unbestätigten
Multispektralwerte erfinden.
