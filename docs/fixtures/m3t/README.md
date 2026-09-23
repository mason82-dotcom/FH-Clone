# Reales DJI-M3T-Referenzfixture

Dieses Verzeichnis dokumentiert reale M3T-Hardwarebefunde, ohne die
Originalaufnahmen oder vollständigen EXIF/XMP-Rohdaten öffentlich im
Repository zu speichern.

Synthetische DJI-Payloads dürfen hier nicht als Hardwarebeleg abgelegt werden.

## Datenschutz- und Fixture-Regel

Die Originaldateien enthalten potenziell sensible Informationen wie:

- GPS-Koordinaten
- Geräte-/Kameraseriennummern
- Aufnahmeorte/-zeiten
- weitere Hersteller-Metadaten

Deshalb liegen reale Original-JPG/TXT-Dateien **nicht** im öffentlichen Git.

Lokaler Arbeitsbereich:

```text
local-fixtures/
```

Dieser Pfad ist per `.gitignore` ausgeschlossen.

Öffentlich versioniert werden nur:

- redigierte, abgeleitete Manifeste
- nicht sensible Feld-/Schema-Befunde
- reproduzierbare Parser-/Normalizer-Tests ohne echte Identifikatoren

## Authoritative Rohquellen

Für eine lokale Hardwareprüfung werden die Originaldateien außerhalb von Git
bereitgestellt und unter `local-fixtures/` abgelegt.

Die vollständigen EXIF/XMP-Ausgaben bleiben lokal authoritative.
`media-manifest.json` ist die öffentliche, datensparsame Zusammenfassung.

Exakte GPS-Koordinaten, Geräte-/Kameraseriennummern und sonstige sensible
Originalwerte werden dort bewusst nicht dupliziert.

## Verifizierte M3T-Eigenschaften

Die realen Wide-Samples bestätigen unter anderem:

- DJI M3T
- `Image Source: WideCamera`
- 4000 x 3000 Pixel
- 4,4 mm reale Brennweite
- 24 mm Kleinbildäquivalent
- f/2.8
- `Surveying Mode: 1`
- Aircraft- und Gimbal-Pose
- `UTC At Exposure`

### Sample 1 – GNSS / nicht RTK

Bestätigt:

- `Gps Status: Normal`
- `Altitude Type: GpsFusionAlt`
- kein `Rtk Flag`

Das ist **kein RTK-No-Fix-Beleg**, sondern ein realer GNSS-/Nicht-RTK-Sample.

### Sample 2 – RTK Fixed

Bestätigt:

- `Gps Status: RTK`
- `Altitude Type: RtkAlt`
- `Rtk Flag: 50`
- RTK-Standardabweichungen vorhanden
- `Rtk Diff Age: 1.4 s`

Damit liegt ein echter M3T-Dateibefund für RTK Fixed vor.

## Wichtiger Zeitbefund

Bei beiden realen M3T-Dateien ist `UTC At Exposure` nicht identisch mit
`Date/Time Original` nach Zeitzonen-Normalisierung. Die beobachtete Differenz
liegt ungefähr im Bereich von 21 Sekunden.

FH2 darf diese Felder daher nicht still gleichsetzen. `UTC At Exposure`
bleibt die spezifische DJI-Belichtungszeit; `Date/Time Original` und
`Create Date` werden als getrennte Herstellerfelder erhalten.

## RTK-Regel für Datei-Metadaten

`Gps Status: RTK` allein ist kein hinreichender Fixed-Nachweis.

Für den Datei-Metadatenpfad bleibt der feinere `RtkFlag`-Status maßgeblich.
Der reale M3T-Sample bestätigt `RtkFlag=50` für Fixed.

## Noch fehlend für das vollständige M3T-Referenzfixture

Reale Hardwaredaten fehlen weiterhin für:

- Tele-JPEG
- Thermal-RJPEG
- MQTT `update_topo`
- vollständiges MQTT `osd/state`
- MQTT `cameras[]`
- echtes RTK-Fix/No-Fix-Paar aus MQTT
- MQTT-Batteriearray

Der Fixture-Status bleibt deshalb `partial_real_hardware_fixture`.

## Git-History und Datenschutz

Die normalen Datei-Pfade der ursprünglichen DJI-Rohfixtures sind aus der
aktuellen `main`-Historie entfernt und `.gitignore` blockiert erneutes
Einchecken. Das öffentliche Manifest veröffentlicht keine Commit-, Blob- oder
Rohdateipfad-Referenzen mehr.

Ein früherer Git-Objektstand ist bei GitHub jedoch weiterhin direkt über eine
bereits bekannte Objekt-ID erreichbar. Das ist **kein Laufzeit- oder
Hardware-Gate**, aber ein Repository-Datenschutzpunkt. Vollständige Entfernung
aus GitHubs Objekt-/Cachebestand erfordert die separate Sensitive-Data-Removal-
Prozedur des Hosters. Bis deren Abschluss dürfen alte Commit-/Blob-IDs nicht
weiter dokumentiert oder verteilt werden.
