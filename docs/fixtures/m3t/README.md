# Reales DJI-M3T-Referenzfixture

Dieses Verzeichnis beschreibt ausschließlich **reale** M3T-Daten aus dem Repository.
Synthetische DJI-Payloads dürfen hier nicht als Hardwarebeleg abgelegt werden.

## Authoritative Rohquellen

Die vollständige EXIF/XMP-Ausgabe liegt unverändert in:

- `docs/DJI_20230426201904_0001_V.txt`
- `docs/DJI_20240225160726_0027_V.txt`

Die dazugehörigen Originalbilder sind:

- `docs/DJI_20230426201904_0001_V.JPG`
- `docs/DJI_20240225160726_0027_V.JPG`

`media-manifest.json` ist nur eine abgeleitete, datensparsame Zusammenfassung.
Exakte GPS-Koordinaten, Geräte-/Kameraseriennummern und NTRIP-Endpunkte werden dort
bewusst nicht dupliziert. Die Roh-TXT-Dateien bleiben für die vollständige
Hersteller-Metadatenprüfung maßgeblich.

## Verifizierte M3T-Eigenschaften

Beide Dateien melden:

- `Camera Model Name: M3T`
- `Drone Model: M3T`
- `Image Source: WideCamera`
- 4000 x 3000 Pixel
- 4,4 mm reale Brennweite
- 24 mm Kleinbildäquivalent
- f/2.8
- `Surveying Mode: 1`
- vollständige Aircraft- und Gimbal-Pose
- `UTC At Exposure`

### Sample 1 – GNSS / nicht RTK

`DJI_20230426201904_0001_V.JPG`:

- `Gps Status: Normal`
- `Altitude Type: GpsFusionAlt`
- kein `Rtk Flag`

Das ist **kein RTK-No-Fix-Beleg**, sondern ein realer GNSS-/Nicht-RTK-Sample.

### Sample 2 – RTK Fixed

`DJI_20240225160726_0027_V.JPG`:

- `Gps Status: RTK`
- `Altitude Type: RtkAlt`
- `Rtk Flag: 50`
- RTK Standardabweichungen vorhanden
- `Rtk Diff Age: 1.4 s`

Damit liegt ein echter M3T-Dateibeleg für RTK Fixed vor.

## Wichtiger Zeitbefund

Bei beiden realen M3T-Dateien ist `UTC At Exposure` nicht identisch mit
`Date/Time Original` nach Zeitzonen-Normalisierung. Die Differenz beträgt
ungefähr 21 Sekunden.

FH2 darf diese Felder daher nicht still gleichsetzen. `UTC At Exposure`
bleibt die spezifische DJI-Belichtungszeit; `Date/Time Original` und
`Create Date` werden als getrennte Herstellerfelder erhalten.

DJI dokumentiert für Mavic 3E/3T bei der PSDK-Zeitsynchronisation keine
zusätzliche Leap-Second-Kompensation. Die beobachtete Differenz wird daher
nicht automatisch als Schaltsekundenkorrektur interpretiert; sie bleibt ein
realer Fixture-Befund, bis die Ursache separat verifiziert ist.

## RTK-Regel für Datei-Metadaten

`Gps Status: RTK` allein ist kein hinreichender Fixed-Nachweis.

Für den Datei-Metadatenpfad bleibt der feinere `RtkFlag`-Status maßgeblich.
Der reale M3T-Sample bestätigt `RtkFlag=50` für Fixed. Das separate M4T-
Beispiel im Repository zeigt zusätzlich, dass `Gps Status: RTK` auch mit
einem anderen `RtkFlag` auftreten kann und deshalb nicht als Boolean
interpretiert werden darf.

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
