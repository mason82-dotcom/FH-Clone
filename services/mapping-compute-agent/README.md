# FH2 Mapping Compute-Agent

Dieser Dienst ist aus dem AeroNexus-Compute-Agent abgeleitet und an die
FH-Clone-Control-API angepasst. Er läuft auf einem x64-Rechner beziehungsweise
unter WSL2/Linux und zieht Photogrammetrie-Jobs selbständig aus FH2.

## Sicherheitsmodell

Der Worker erhält ausschließlich:

- `MAPPING_AGENT_TOKEN`,
- kurzlebige, signierte GET-URLs für ausgewählte Quellbilder,
- kurzlebige, auf `<job-id>/...` begrenzte PUT-URLs für Ergebnisse.

Er erhält keine PostgreSQL-, DJI-, MQTT-, DRC- oder S3-Dauer-Credentials.
Mapping ist FC0-Datenverarbeitung und erzeugt keine Control Authority.

## Datenfluss

```text
FH2 Control API
  -> claim + Lease
  -> Presigned GET URLs
Compute-Agent
  -> NodeODM/ODM
  -> GDAL COG + XYZ
  -> Presigned PUT URLs
FH2 Control API
  -> Objektprüfung
  -> mapping_results / mapping_layers
```

Der Agent erzeugt je nach verfügbaren NodeODM-Ergebnissen:

- Orthofoto als COG,
- DSM als COG,
- DTM als COG,
- ODM-Report,
- Web-Mercator-XYZ-PNG-Tiles,
- `manifest.json` mit Hashes und Größen.

## Voraussetzungen

Auf dem FH2-Server müssen der Mapping-Store, S3/MinIO und
`MAPPING_AGENT_TOKEN` konfiguriert sein. `MAPPING_S3_PUBLIC_ENDPOINT` muss
vom Compute-Rechner erreichbar sein.

Auf dem Compute-Rechner:

- Docker Engine bzw. Docker Desktop/WSL2,
- für GPU-Betrieb NVIDIA-Treiber und GPU-Passthrough,
- ausreichend RAM/Swap.

## Start

```bash
cd services/mapping-compute-agent
cp .env.example .env
nano .env
docker compose up -d --build
```

GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Der NodeODM-Port wird ausschließlich an `127.0.0.1:3000` veröffentlicht.
Der Agent spricht intern mit `http://nodeodm:3000`.

## Ressourcenbegrenzung

`MAX_IMAGES` schützt den Compute-Knoten vor offensichtlich zu großen Jobs.
Der Standard ist 200 Bilder. Für große Projekte müssen RAM/Swap und
`MAX_IMAGES` bewusst erhöht werden.

## Test ohne echte Photogrammetrie

`tools/fake_nodeodm.py` simuliert die NodeODM-API. Damit kann der gesamte
FH2-Job-/Download-/Upload-/Complete-Pfad getestet werden, ohne einen echten
ODM-Lauf zu starten.

## Herkunft und Lizenzgrenze

Scheduler-, Pull-Agent- und Postprocessing-Konzept stammen aus dem
AeroNexus-Mapping-/Compute-Pfad und wurden in FH-Clone integriert.

NodeODM/ODM werden nicht in den FH-Clone-Code eingebettet. Sie laufen als
separate, unveränderte AGPL-3.0-Dienste und werden nur über HTTP angesprochen.
