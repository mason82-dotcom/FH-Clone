# Medien, Kamera und Multispektral

## Status

Dieses Dokument beschreibt den verbindlichen V3-Fachrahmen.

Die endgültige Feld-/Quellenmatrix aus dem Multispektral-Arbeitspaket muss vor
dem V3 Release Candidate abgeschlossen werden. Unbestätigte Herstellerfelder
werden hier nicht als vorhanden ausgegeben.

## Zielobjekte

V3 verwendet folgende Domänenobjekte:

```text
MediaAsset
SensorSource
SpectralBand
CaptureContext
ProcessingProfile
```

## MediaAsset

Ein MediaAsset beschreibt eine einzelne Datei oder ein eindeutig adressierbares
Medienobjekt.

Vorgesehene Felder:

- eindeutige Media-ID
- Dateiname/Object-Key
- MIME-/Medientyp
- Capture-Zeit
- `device_sn`
- Payload-/Sensorreferenz
- Position
- Höhenbezug
- Gimbal-/Aircraft-Pose
- Missions-/Task-Referenz
- vorhandene Metadatenquelle

## SensorSource

Sensorquellen werden nicht nur über Anzeigenamen erkannt.

Vorgesehene Identität:

- `device_sn`
- Payload-/Gimbal-Index
- Kamera-/Sensor-Index
- Video-/Lens-Index
- Hersteller-/Produktinformation, sofern authoritative
- Laufzeitquelle des Adapters

## SpectralBand

Für M3M müssen mindestens folgende fachlichen Bänder unterscheidbar sein:

```text
RGB
GREEN
RED
RED_EDGE
NIR
```

Eine Bandzuordnung darf nicht allein aus Dateiname, UI-Anzeigename oder
Modellname abgeleitet werden.

Wo möglich werden authoritative Hersteller-Metadaten verwendet.

## CaptureContext

Der Aufnahmekontext verbindet Medien mit:

- Zeit
- Position
- RTK-Status
- Höhe
- Aircraft-Pose
- Gimbal-Pose
- Sensorquelle
- Mission/Task
- sichere Korrekturquellenreferenz

NTRIP-Secrets sind kein Bestandteil des CaptureContext.

## Media-Korrelation

Jede Beziehung wird klassifiziert als:

```text
authoritative
derived
heuristic
unavailable
```

Beispiele:

```text
media -> device_sn
media -> payload/sensor
media -> capture_time
media -> position
media -> mission/task
media -> band
media -> processing profile
```

Heuristische Zuordnungen dürfen nicht stillschweigend als authoritative
persistiert werden.

## ProcessingProfile

Pflichtprofile:

### GENERIC

Für Medien ohne ausreichende Sensorspezialisierung.

### RGB

Benötigt eine eindeutig verwendbare sichtbare Bildquelle.

### THERMAL

Benötigt eine bestätigte Thermal-/IR-Quelle und deren relevante
produktspezifische Metadaten.

### MULTISPECTRAL

Benötigt die fachlich identifizierten Bänder und ausreichenden
Aufnahmekontext.

### NDVI

Statusmodell:

```text
NDVI_READY
NDVI_PARTIAL
NOT_NDVI_CAPABLE
```

`NDVI_READY` darf nur gesetzt werden, wenn mindestens **Red und NIR
authoritative identifiziert** sind.

Kalibrierungs-, Irradiance- und Sonnensensordaten werden separat bewertet und
dürfen nicht erfunden werden, wenn sie im realen DJI-Datenpfad fehlen.

## RTK und Position

RTK erhöht die Qualität der Georeferenzierung, ist aber nicht gleichbedeutend
mit Band- oder Radiometriekalibrierung.

Zu dokumentieren sind:

- GPS/RTK-Position
- Fix-Zustand
- relevante Höhe
- Aufnahmezeit
- Pose

## Datenquellen

Mögliche Quellen müssen pro Feld einzeln bewertet werden:

1. DJI Cloud API / MQTT
2. DJI Media API
3. EXIF
4. XMP
5. MSDK
6. manuelle/Projektmetadaten
7. nicht verfügbar

## V3-Abnahme

Vor V3-RC müssen vorhanden sein:

- Feld-/Quellenmatrix
- M3E/M3T/M3M Sensor-/Payload-Matrix
- M3M-Bandvertrag
- Media-Korrelationsregeln
- Profilvalidierung
- Testfälle für vollständige und unvollständige Datensätze

## Sicherheits- und Architekturgrenze

Dieses Modul definiert Daten und Verarbeitung. Es baut keine parallele
Backend-, MQTT- oder Persistenzarchitektur.

Schreibende Kamera-/Payload-Steuerung bleibt dem zentralen Capability-,
Control- und Safety-Pfad untergeordnet.
