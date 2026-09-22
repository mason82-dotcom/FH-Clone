# Abgleich FH2 V3 und M4-Cloud V2

## Zweck

M4-Cloud V2 und FH-Clone/FH2 V3 sind getrennte Projekte mit unterschiedlichen
Schwerpunkten.

Der Abgleich verhindert, dass Sicherheits- oder Protokollregeln
widersprüchlich umgesetzt werden.

## Verbindliche DJI-OpenAPI-V2-Referenz

Für den FlightHub-2-OpenAPI-V2-Pfad gilt zusätzlich das offizielle DJI-Repository

`dji-sdk/FlightHub-2-OpenAPI-V2-Demo`

als Upstream-Referenz. Die vom Projektinhaber bereitgestellte
`OpenAPI-V2-Demo.zip` wurde über die Git-Blob-SHAs gegen den aktuellen
DJI-`main`-Stand geprüft; die enthaltenen Dateien entsprechen dem offiziellen
Stand.

Für FH2 gelten daraus folgende Referenzstufen:

1. **Privatization** ist der primäre API-Vertrag für das lokale/On-Premises-
   FlightHub-2-Szenario.
2. **Shared/request.ts** und **Shared/types.ts** sind Referenz für
   Header-, Query- und DJI-`code/data/message`-Semantik.
3. **PublicCloud** ist eine Vergleichsreferenz. Public-Cloud-spezifische
   Endpunkte werden nicht automatisch auf Privatization übertragen.
4. Demo-Polling von 30 Sekunden ist ein zulässiges Muster für
   Inventar-/Task-/Supervision-Snapshots, nicht für hochfrequente
   Flugtelemetrie.
5. Schreibende Demo-Funktionen wie
   `POST .../flight-tasks` sind keine automatische FH2-Freigabe. In FH2
   bleiben FC-Stufe, Control Authority, Lease und Release-Freeze maßgeblich.
6. DJI-Tokens aus der Server-OpenAPI bleiben in FH2 serverseitige Secrets.
   Ein Demo-`KeyCenter.ts` ist kein Sicherheitsmuster für die produktive
   Browserarchitektur.

Als normative Referenz gelten insbesondere:

- `Privatization/DeviceList`
- `Privatization/FlightTaskLibrary`
- `Shared/request.ts`
- `Shared/types.ts`
- die zugehörigen README-Verträge

Bei späterem Drift zwischen dem gespeicherten ZIP-Snapshot und dem offiziellen
DJI-Repository wird vor einer Änderung der aktuelle DJI-Upstream erneut
verifiziert.

## Referenzstand M4

M4-Cloud bleibt der stabile V2-Referenzpfad für:

- FlightHub 2 Privatization OpenAPI V2
- read-only FH2-Ressourcen
- DJI Cloud API Bootstrap
- Basic-Link-MQTT
- dynamische Kamera-/Videopfad-Erkennung
- lokale Betriebs-/Verify-Abläufe

M4 V2 bleibt eingefroren, solange kein neuer ausdrücklicher Auftrag erfolgt.

## FH2 V3

FH-Clone entwickelt die umfassendere modulare Zielarchitektur:

- SDK-neutraler Aircraft Core
- dynamische Geräte-/Capability-Registry
- EMQX AuthN/AuthZ
- Gateway-/Sub-Device-Topologie
- RTK
- WebUI
- Media/Multispektral
- UgCS
- Control Authority und Safety
- optionaler DRC-Code unter FC3

## Gemeinsame Sicherheitsstufen

| Stufe | Bedeutung |
| --- | --- |
| FC0 | Analyse, Lesen und Planung |
| FC1 | kontrollierte nicht flugkritische Schreibzugriffe |
| FC2 | Mission/Task |
| FC3 | Flugsteuerung, RTH, DRC |

FH2 startet immer auf FC0.

## FlightHub 2 OpenAPI V2

M4 bleibt die verifizierte Referenz für die aktuell verwendeten
read-only-Ressourcen, darunter:

- Devices
- HMS
- Waylines
- Flight Tasks

Verwendete Header:

- `X-User-Token`
- `X-Project-Uuid`
- `X-Request-Id`
- `X-Language`

FH2 erfindet keine nicht dokumentierten Write-Endpunkte.

## DJI Cloud API

DJI Cloud API und FlightHub-2-OpenAPI bleiben getrennte Integrationspfade.

Gemeinsame Konzepte:

- Basic Link
- `gateway_sn` / `device_sn`
- `update_topo`
- OSD/State
- Services/Replies
- Capability-Gating

## MQTT-Broker

M4 V2 verwendet Mosquitto mit statischer, restriktiver Basic-Link-Konfiguration.

FH2 V3 verwendet EMQX mit dynamischer Gateway-/Topologie-Autorisierung.

Das ist kein Topic-Protokollkonflikt. FH2 V3 erweitert das
Sicherheitsmodell, ohne den eingefrorenen M4-V2-Stack stillschweigend
umzubauen.

## RC Pro

Gemeinsames Topologiemodell:

```text
Controller gateway_sn
      |
      +-- Aircraft device_sn
```

FH2 V3 geht darüber hinaus und entkoppelt die MQTT-Client-ID vollständig von
der Sicherheitsidentität.

## Kamera und Medien

Stabile gemeinsame Begriffe bleiben:

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

FH2 V3 ergänzt darauf aufbauend den Media-/Sensor-/Bandvertrag.

## DRC

M4 V2 bleibt DRC-frei.

FH2 V3 darf DRC-Code enthalten, aber nur als standardmäßig gesperrte
FC3-Funktion mit:

- Control Lease
- DJI Authority
- separater DRC-Sitzung
- Dead-Man
- Broker-Isolation

## CI

Nur der Direktor startet die finale zentrale CI.

Nach V3.0 endet die FH2-Entwicklung, sofern kein neuer ausdrücklicher Auftrag
erteilt wird.
