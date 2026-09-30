# DJI Thermal SDK (TSDK) Integration

Stand: 01.10.2026

FH2 bindet den DJI Thermal SDK **nicht als eingechecktes Binärartefakt**, sondern
als optionalen lokalen Native-Adapter ein. Dadurch bleiben DJI-Lizenzdateien,
Binärbibliotheken und Testdatensätze außerhalb des öffentlichen Repositories.

## Zielversion

FH2 ist auf **DJI Thermal SDK v1.8** ausgerichtet.

Offizielle DJI-Downloadseite:

https://www.dji.com/downloads/softwares/dji-thermal-sdk

DJI beschreibt TSDK als Windows-/Linux-SDK zur Verarbeitung radiometrischer
R-JPEG-Dateien und zur Temperaturmessung. Die aktuelle offizielle
Produktliste umfasst unter anderem die DJI Mavic 3 Enterprise Serie und die
DJI Matrice 4 Serie.

Für FH2 sind damit insbesondere diese realen Hardwarepfade relevant:

- Mavic 3 Thermal (M3T)
- Mavic 3TA
- Matrice 4T
- weitere von DJI für TSDK v1.8 freigegebene Thermal-Produkte

Die Produktfreigabe des TSDK erzeugt **keine** FH2-Control-Capability und
ersetzt keine reale Hardware-Evidence.

## Architektur

Der Adapter liegt unter:

```text
packages/adapters/dji-thermal/
```

Er kapselt das von DJI mitgelieferte Kommandozeilenwerkzeug `dji_irp`.
FH2 ruft das Tool ausschließlich als separaten Prozess auf. Dadurch muss
`libdirp` nicht als Node-Native-Addon in den Control-API-Prozess gelinkt
werden.

Unterstützte Operationen:

```text
probe
measure  -> Temperatur-Raster (int16 oder float32)
extract  -> RAW16
process  -> Pseudofarben-Raster
```

Das Original-R-JPEG wird nicht verändert.

## Installation

DJI TSDK v1.8 von der offiziellen DJI-Seite herunterladen und außerhalb des
Repositories entpacken, zum Beispiel:

```text
/opt/dji-tsdk/
```

Dann lokal konfigurieren:

```bash
DJI_TSDK_HOME=/opt/dji-tsdk
```

Für das DJI-Standardlayout werden automatisch erkannt:

```text
Linux x64:
  utility/bin/linux/release_x64/dji_irp
  tsdk-core/lib/linux/release_x64/

Linux x86:
  utility/bin/linux/release_x86/dji_irp
  tsdk-core/lib/linux/release_x86/

Windows x64:
  utility/bin/windows/release_x64/dji_irp.exe
  tsdk-core/lib/windows/release_x64/
```

Benutzerdefinierte Installationen können explizit gesetzt werden:

```bash
DJI_TSDK_IRP_BIN=/path/to/dji_irp
DJI_TSDK_LIB_DIR=/path/to/tsdk/libs
```

## Raspberry Pi 5 / ARM64

Das öffentlich dokumentierte Standardlayout von TSDK v1.8 wird in FH2 nur für
x86/x64 aufgelöst. Für Linux ARM64 wird **kein** nicht belegter DJI-Binärpfad
erfunden.

Auf dem Raspberry Pi 5 ergibt deshalb:

```text
official_v1_8_has_no_known_linux_arm64_layout
```

Das ist absichtlich fail-closed.

Praktische Betriebsvarianten:

1. TSDK auf einem Linux-x86_64-Rechner ausführen und die erzeugten
   Temperatur-/RAW-Derivate in den bestehenden FH2-Medienworkflow übernehmen.
2. Falls DJI später ein ARM64-Binary bereitstellt, kann dieses über
   `DJI_TSDK_IRP_BIN` und `DJI_TSDK_LIB_DIR` explizit angebunden werden.
3. Eine x86_64-Emulation auf ARM64 ist kein FH2-Standardpfad und gilt nicht
   automatisch als produktionsreif.

## Verifikation

```bash
npm run verify:dji-thermal-sdk
```

Bei einer x86_64-Installation mit `DJI_TSDK_HOME` muss `ready=true`
erscheinen.

## R-JPEG verarbeiten

Status/Probe:

```bash
npm run thermal:rjpeg -- --action probe
```

Temperaturwerte als FLOAT32:

```bash
npm run thermal:rjpeg -- \
  --action measure \
  --input /data/DJI_0001_R.JPG \
  --output /data/DJI_0001_temperature_f32.raw \
  --measurefmt float32
```

RAW16 extrahieren:

```bash
npm run thermal:rjpeg -- \
  --action extract \
  --input /data/DJI_0001_R.JPG \
  --output /data/DJI_0001_raw16.raw
```

Pseudofarben:

```bash
npm run thermal:rjpeg -- \
  --action process \
  --input /data/DJI_0001_R.JPG \
  --output /data/DJI_0001_iron_red.raw \
  --palette iron_red
```

## Sicherheits- und Provenienzregeln

- DJI-TSDK-Binärdateien, `License.txt` und DJI-Datasets werden nicht in FH2
  vendort oder gespiegelt.
- R-JPEG-Originale bleiben außerhalb von Git.
- FH2 verändert keine Originaldatei in-place.
- Thermal-Verarbeitung erzeugt keine Flight-Control-/Payload-Control-Rechte.
- Ein erfolgreicher TSDK-Decode ist technische R-JPEG-Evidence, ersetzt aber
  nicht die übrigen M3T/M4T-Hardware-Gates.
- Öffentliche Evidence-Fixtures dürfen weiterhin nur redigierte Metadaten und
  kryptographische Hashes enthalten.
