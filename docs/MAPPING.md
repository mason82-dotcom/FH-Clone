# Mapping / Photogrammetrie

Stand: 2. Oktober 2026

FH-Clone V3.1 übernimmt für die Photogrammetrie gezielt Architekturbausteine aus
`mason82-dotcom/AeroNexus`, ohne dessen DJI-Demo-Backend oder MySQL-Datenmodell
zu duplizieren.

## Architektur

```text
MediaAsset + objectKey
        |
        v
S3/MinIO Media Bucket
        |
        | Presigned GET
        v
x64/GPU Compute-Agent
        |
        v
NodeODM / ODM
        |
        +--> Orthofoto COG
        +--> DSM / DTM COG
        +--> Report
        +--> XYZ PNG Tiles
        |
        | Presigned PUT
        v
S3/MinIO Result Bucket
        |
        v
FH2 Control API
        |
        +--> mapping_results
        +--> mapping_layers
```

Der Scheduler verwendet PostgreSQL/TimescaleDB. Ein Mapping-Job referenziert
bestehende `media_assets.asset_id`-Werte. Jedes Quell-Asset muss einen
`objectKey` besitzen.

## Scheduler

Übernommen und an FH-Clone angepasst:

- `QUEUED -> CLAIMED -> RUNNING -> DONE/FAILED`,
- exklusives Claiming über `FOR UPDATE SKIP LOCKED`,
- Lease + Heartbeat,
- automatisches Requeue abgelaufener Leases,
- begrenzte Lease-Wiederholungen,
- persistierte Ergebnisse und Kartenlayer.
- Admission-Check gegen den Media-Bucket vor dem Queueing, sobald S3/MinIO konfiguriert ist.

## Operator-API

Standardmäßig deaktiviert. Ein gesetztes `MAPPING_OPERATOR_TOKEN` aktiviert:

- `GET /api/mapping/jobs`
- `POST /api/mapping/jobs`

Authentifizierung:

```http
Authorization: Bearer <MAPPING_OPERATOR_TOKEN>
```

`GET /api/mapping/status` enthält nur nicht-sensitive Aktivierungszustände.

## Compute-Agent-API

Der Agent-Pfad wird nur aktiv, wenn gleichzeitig

- `MAPPING_AGENT_TOKEN` gesetzt ist und
- der S3-kompatible Object Store vollständig konfiguriert ist.

Endpunkte:

```text
POST /api/mapping/agent/claim
POST /api/mapping/agent/jobs/{job_id}/image-urls
POST /api/mapping/agent/jobs/{job_id}/heartbeat
POST /api/mapping/agent/jobs/{job_id}/upload-urls
POST /api/mapping/agent/jobs/{job_id}/complete
POST /api/mapping/agent/jobs/{job_id}/fail
```

Der Agent erhält keine S3-Dauer-Credentials. Quellbilder werden über kurzlebige
GET-URLs gelesen; Resultate werden ausschließlich über kurzlebige PUT-URLs
unter dem Prefix des geclaimten Jobs hochgeladen.

Vor `complete` prüft die Control API serverseitig, dass alle im Manifest
angegebenen Dateien existieren. Für XYZ-Tiles muss mindestens ein Objekt unter
dem angegebenen Tile-Prefix vorhanden sein.

## Object Store

FH-Clone spricht S3-kompatible Stores über SigV4 an. Die Signierung wird mit
Node-Bordmitteln erzeugt; zusätzliche AWS-/MinIO-SDK-Abhängigkeiten sind nicht
erforderlich.

Pflichtwerte für den Agent-Pfad:

```text
MAPPING_S3_INTERNAL_ENDPOINT
MAPPING_S3_PUBLIC_ENDPOINT
MAPPING_S3_ACCESS_KEY
MAPPING_S3_SECRET_KEY
MAPPING_MEDIA_BUCKET
MAPPING_RESULTS_BUCKET
```

Optional:

```text
MAPPING_S3_REGION=us-east-1
MAPPING_PRESIGN_TTL_SECONDS=3600
```

`MAPPING_S3_INTERNAL_ENDPOINT` ist die vom Control-API-Container erreichbare
Adresse. `MAPPING_S3_PUBLIC_ENDPOINT` muss vom externen Compute-Knoten
erreichbar sein.

## Media-Bucket-Ingest

Der FH2-Media-Ingest kann große Dateien ohne Proxying durch die Control API
direkt in den konfigurierten Media-Bucket schreiben:

```text
POST /internal/media/upload-url
       |
       +--> gehashter ingest/<prefix>/<sha256>.<ext>-Key
       +--> kurzlebige Presigned PUT URL
       |
       v
S3/MinIO Media Bucket
       |
       v
POST /internal/media/assets/verified
       |
       +--> HEAD-Prüfung
       +--> Object-Key/Asset-Bindung
       +--> media_assets
```

Beide Endpunkte liegen ausschließlich auf der internen API und verlangen
`MEDIA_INGEST_TOKEN`. Originaldateiname und Asset-ID werden nicht in den
generierten Object-Key übernommen.

### Optionales lokales MinIO

```bash
docker compose --profile mapping up -d mapping-minio mapping-minio-init
```

Der MinIO-Baustein wurde aus dem in AeroNexus verwendeten gepinnten Source-Build
übernommen. Er ist für den lokalen/LAN-Betrieb gedacht. Root-Zugang und
dedizierter Mapping-Benutzer müssen vor dem Start gesetzt werden.

## Compute-Agent / NodeODM

Der portierte Worker liegt unter:

```text
services/mapping-compute-agent/
```

CPU:

```bash
cd services/mapping-compute-agent
cp .env.example .env
docker compose up -d --build
```

NVIDIA-GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

NodeODM 3.6.2 und der GPU-Unterbau sind per Version/Digest beziehungsweise
Commit gepinnt. ODM/NodeODM bleiben separate AGPL-3.0-Container und werden nur
über HTTP angesprochen.

## Cesium-Layer

Persistierte XYZ-Layer können optional in der bestehenden FH2-Cesium-Karte
eingeblendet werden.

```text
MAPPING_LAYER_VIEW_ENABLED=true
```

aktiviert:

- `GET /api/mapping/layers`
- `GET /api/mapping/layers/{layer_id}/tiles/{z}/{x}/{y}.png`

Der Browser lädt ausschließlich den FH2-Tile-Proxy. Die Control API erzeugt
für jeden Tile-Request serverseitig eine kurzlebige signierte Result-URL und
antwortet mit HTTP 302. Weder `MAPPING_S3_ACCESS_KEY` noch
`MAPPING_S3_SECRET_KEY` werden in das Vite-Bundle oder in die Layerliste
geschrieben.

Die bestehende Overlay-Leiste zeigt einen eigenen `Mapping`-Schalter und die
Zahl aktuell verfügbarer Photogrammetrie-Layer. Die Cesium-Imagery-Layer werden
beim Viewer-Wechsel und beim Deaktivieren sauber entfernt.

## Sicherheitsgrenze

Mapping ist FC0-Datenverarbeitung. Der Pfad:

- vergibt keine Control Authority,
- erzeugt keinen DRC-Kontext,
- erzeugt keinen Control Lease,
- erhöht keine FC-Stufe,
- sendet keine Flug- oder Payload-Kommandos.

Der Compute-Agent kennt weder DJI- noch MQTT-Credentials.

## Reproduzierbare End-to-End-Abnahme

Für die vollständige Softwarekette ohne reale Drohne existiert ein eigener
E2E-Test:

```bash
npm run test:mapping-e2e
```

Der Test startet einen isolierten Compose-Projektstack mit:

- TimescaleDB + Migrationen,
- FH2 Control API,
- optionalem Mapping-MinIO,
- echtem FH2 Compute-Agent,
- Fake-NodeODM auf derselben GDAL-Basis wie der Agent.

Der Ablauf verwendet keine direkten DB-Seeds für das Quellbild:

```text
synthetisches PPM
  -> /internal/media/upload-url
  -> Presigned PUT zum Media-Bucket
  -> /internal/media/assets/verified
  -> POST /api/mapping/jobs
  -> Compute-Agent claimt den Job
  -> Fake-NodeODM erzeugt georeferenziertes Orthofoto + DSM
  -> Agent erzeugt COGs + XYZ-Tiles
  -> Presigned Result-PUTs
  -> /complete
  -> mapping_results + mapping_layers
  -> GET /api/mapping/layers
  -> echter PNG-Tile über den read-only Tile-Proxy
```

Das Gate prüft anschließend zusätzlich direkt in PostgreSQL:

- genau ein persistiertes E2E-`MediaAsset`,
- den letzten Mapping-Job als `DONE`,
- mindestens drei `mapping_results`,
- genau einen XYZ-`mapping_layer`.

CI: `.github/workflows/mapping-e2e-validation.yml` wird für Änderungen an
Mapping-, Media-, Object-Store- und Compute-Agent-Pfaden ausgelöst. Der
Workflow ist bewusst getrennt von der schnellen Direktor-V3-Validierung, weil
er Container baut und einen vollständigen GDAL-/Object-Store-Lauf ausführt.

### Reale Hardware-/NodeODM-Abnahme

Der synthetische E2E-Test ersetzt nicht die reale Abnahme. Vor Freigabe des
Mapping-Pfads sind zusätzlich mindestens erforderlich:

1. echte M3M- oder M3T-Datei auf der RC Pro auswählen und manuell zu FH2 laden,
2. Object-Existenz und `MediaAsset.objectKey` prüfen,
3. Job mit einem realen Bildsatz anlegen,
4. echten NodeODM/ODM-Lauf auf dem x64/GPU-Knoten durchführen,
5. Orthofoto/DSM/DTM und Cesium-Layer visuell prüfen,
6. Job-/Result-/Layer-Datensätze und Hashes sichern,
7. erst danach PR aus Draft nehmen.

## Noch offen

- automatische DJI-Cloud-Media-Übernahme in den lokalen Media-Bucket; der MSDK-Pfad ist bereits manuell verdrahtet,
- Operator-Weboberfläche für Jobanlage/Fortschritt erst nach einem browsergeeigneten Operator-Auth-Modell,
- End-to-End-Abnahme mit echtem NodeODM-Datensatz und realem S3/MinIO,
- optional Wake-on-LAN und Ressourcen-Scheduling.

## Herkunft

Das Job-/Lease-, Presign-, Pull-Agent- und Postprocessing-Konzept basiert auf
AeroNexus Mapping Tool / Compute-Agent und wurde an FH-Clone angepasst.
AeroNexus-MySQL-, DJI-Demo-JWT- und direkte
`cloud_sample.media_file`-Abhängigkeiten werden nicht übernommen.
