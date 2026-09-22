# FH2-Manager / M4-Cloud Abgleich

Stand des Abgleichs:

- M4-Cloud `main`: V2.0, Commit `149a2da83312138482bfba96733634be419eae5d`
- FH-Clone `main`: modularer Aircraft-/Groundstation-Core
- Lyrebird: in beiden Pfaden deaktiviert
- CI: nur der Direktor startet/bewertet die zentrale CI
- maßgeblicher Arbeitsstand: `main`

## Rollen der beiden Projekte

### M4-Cloud / FH2-Manager

M4-Cloud bleibt die stabile Integrations-/Betriebsschicht für:

- FlightHub 2 Privatization OpenAPI V2
- DJI Cloud API Bootstrap
- MQTT Basic Link
- dynamische Kamera-/Videopfad-Erkennung
- PostgreSQL/Runtime
- lokale Verify-/Betriebsabläufe

Der aktuelle V2.0-Stand ist sicherheitsseitig read-only bzw. DRC-frei.

### FH-Clone

FH-Clone entwickelt die modulare Domänen- und Adapterarchitektur weiter:

- SDK-neutraler Aircraft Core
- Device-/Parameter-/Capability Registry
- Gateway↔Sub-Device-Topologie
- Control Authority
- zentrale Safety-Stufen
- DJI Cloud API 1.16.1 Kompatibilitätsprofil
- UgCS als Groundstation
- DRC-Engine für explizit unterstützte Plattformen
- spätere MSDK/PSDK/OSDK/Edge-SDK-Adapter

FH-Clone darf M4-Sicherheitsgrenzen nicht durch einen alternativen Direktpfad umgehen.

## Gemeinsame Safety-Stufen

Beide Projekte verwenden denselben Stufenvertrag:

| Stufe | Bedeutung |
| --- | --- |
| FC0 | Analyse, Verträge, read-only; keine realen Downlinks |
| FC1 | kontrollierte nicht-fliegende Downlinks |
| FC2 | Mission/Task Control |
| FC3 | RTH, Aircraft Control, DRC |

FH-Clone startet immer auf **FC0**.

Die Existenz von DRC-/Command-Code hebt FC0 nicht auf.

## Adaptergrenzen

### FlightHub 2 OpenAPI V2

Authoritative für die aktuell verifizierten read-only FH2-Ressourcen:

- Devices
- HMS
- Waylines
- Flight Tasks

Header-/Request-Vertrag aus M4:

- `X-User-Token`
- `X-Project-Uuid`
- `X-Request-Id`
- `X-Language`

FH-Clone implementiert keine erfundenen FH2-Write-Endpunkte.

### DJI Cloud API

Bleibt getrennt von FH2 OpenAPI.

Gemeinsam verwendete Konzepte:

- Basic Link / MQTT
- `gateway_sn` vs. `device_sn`
- `update_topo`
- Device OSD/State
- Service/Reply-Korrelation
- Capability-Gating

### UgCS

UgCS ist eine zusätzliche Groundstation-Schicht in FH-Clone.

UgCS ersetzt weder FH2 OpenAPI noch DJI Cloud API. Missionen/Routen werden über den GroundStationAdapter in das gemeinsame Domainmodell eingebunden.

## RC Pro Enterprise

Gemeinsames Modell:

```text
RC Pro Enterprise (gateway_sn)
        |
        +-- Aircraft (device_sn)
```

Die Topologie wird durch `update_topo` gelernt.

Wichtig:

- OSD/State werden nach `device_sn` verarbeitet.
- Services/DRC werden über `gateway_sn` geroutet.
- RC Pro Enterprise ist DJI product type 144.
- Mavic 3 Enterprise Series ist product type 77.

Für M3E/M3T/M3M wird Cloud-Flugsteuerung nicht allein aus vorhandenen DRC-Topics abgeleitet; das Capability-Profil entscheidet.

## Kamera-/Payload-Modell

FH-Clone übernimmt die stabilen M4-Schlüssel als gemeinsame Terminologie:

- `device_sn`
- `payload_index`
- `video_index`
- `video_type`
- `video_id`
- `lens_index`
- `live_source`
- `zoom_factor`
- `focal_length_mm`
- `iso`
- `shutter_speed`
- Gimbal Pitch/Roll/Yaw

Multispektral-/NDVI-Felder werden nicht aus Modellnamen erfunden. Die fachlichen Ergebnisse aus M4-Issues #14, #16 und #15 werden später als gemeinsamer Vertrag übernommen.

## MQTT / Broker

Aktuell besteht ein Infrastrukturunterschied:

- M4-Cloud V2.0: Mosquitto, Basic Link, DRC gesperrt
- FH-Clone: EMQX-Entwurf mit dynamischer Gateway/Sub-Device-Autorisierung

Das ist kein Protokollkonflikt. Die gemeinsame DJI-Topic-Semantik bleibt gleich.

Die dynamische EMQX-Autorisierung aus FH-Clone ist ein Kandidat für eine spätere Manager-Version, **nicht** eine stillschweigende Änderung des eingefrorenen M4-V2.0-Stacks.

## DRC

FH-Clone enthält eine DRC-Engine, aber:

- Default Safety Stage = FC0
- kein öffentlicher DRC-Endpunkt
- keine Browser-Direktsteuerung
- M3E/M3T/M3M erhalten über Pilot Cloud keine automatische `control.flight`-Capability
- Aktivierung verlangt FC3 und eine explizite Produkt-/API-Freigabe

Damit bleibt FH-Clone kompatibel zur Sicherheitsgrenze des FH2-Managers.

## CI und Integration

FH-Clone startet keine zentrale M4-CI.

Änderungen, die in M4-Cloud übernommen werden sollen, werden dem Manager als klar abgegrenztes Arbeitspaket/Issue übergeben. Der Direktor entscheidet dort über CI und Freigabe.
