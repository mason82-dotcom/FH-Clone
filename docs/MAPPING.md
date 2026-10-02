# Mapping / Photogrammetrie

Stand: 2. Oktober 2026

FH-Clone V3.1 übernimmt für die Photogrammetrie gezielt Architekturbausteine aus
`mason82-dotcom/AeroNexus`, ohne dessen DJI-Demo-Backend oder MySQL-Datenmodell
zu duplizieren.

## Übernommenes Konzept

Aus AeroNexus werden folgende bewährte Mechanismen adaptiert:

- persistente Mapping-Jobs,
- Zustände `QUEUED -> CLAIMED -> RUNNING -> DONE/FAILED`,
- exklusives Claiming mit Lease,
- Heartbeat-Verlängerung,
- Requeue abgelaufener Leases,
- begrenzte Wiederholungsversuche,
- externer x64/GPU-Compute-Agent als Pull-Worker.

Die FH-Clone-Implementierung verwendet dafür PostgreSQL/TimescaleDB und die
bereits normalisierten `media_assets`. Ein Mapping-Job referenziert
`asset_id`-Werte; der Scheduler akzeptiert nur Assets, die vorhanden sind und
einen nichtleeren `objectKey` besitzen.

## Sicherheitsgrenze

Mapping ist ein Datenverarbeitungspfad. Es erzeugt **keine** Control Authority,
keinen DRC-Kontext, keinen Control Lease und keine FC-Freigabe.

Die Operator-API ist standardmäßig deaktiviert. Erst ein gesetztes
`MAPPING_OPERATOR_TOKEN` aktiviert:

- `GET /api/mapping/jobs`
- `POST /api/mapping/jobs`

Beide Endpunkte erwarten `Authorization: Bearer <MAPPING_OPERATOR_TOKEN>`.

`GET /api/mapping/status` zeigt nur den nicht sensitiven Aktivierungszustand.

## Aktueller Integrationsstand

Vorhanden:

- Migration `009_mapping_jobs.sql`,
- `MappingStore` mit atomischem Claiming über `FOR UPDATE SKIP LOCKED`,
- Lease/Heartbeat/Requeue/Complete/Fail im Store,
- Validierung der Job- und Agent-Eingaben,
- MediaAsset-Auflösung über die bestehende Persistenz,
- Readiness- und Shutdown-Integration,
- geschützte Operator-Endpunkte.

Noch bewusst **nicht** freigeschaltet:

- Agent-HTTP-Endpunkte,
- Presigned GET/PUT URLs,
- MinIO/S3-Storage,
- NodeODM-Compute-Agent,
- COG/DSM/DTM/XYZ-Ergebnisregistrierung,
- Cesium-Layerdarstellung.

Der Agent-Pfad bleibt bis zur Storage-Integration fail-closed. Dadurch kann kein
Worker einen Job claimen, ohne die Quelldateien sicher herunterladen und
Ergebnisse sicher hochladen zu können.

## Herkunft

Das Job-/Lease-Konzept basiert auf dem AeroNexus Mapping Tool und Compute-Agent.
Der Code wurde an die FH-Clone-Domäne angepasst; AeroNexus-MySQL-, DJI-Demo-JWT-
und direkte `cloud_sample.media_file`-Abhängigkeiten werden nicht übernommen.

ODM/NodeODM soll weiterhin als separater Container über dessen HTTP-API
angebunden werden. Damit bleibt die Engine technisch und lizenzseitig klar vom
FH-Clone-Code getrennt.
