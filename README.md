# FH-Clone

Modulare FlightHub-2-Clone-Plattform zur Anbindung mehrerer Fluggeräte-Schnittstellen.

## Architekturprinzip

Der Core kennt keine konkrete DJI-SDK-Implementierung. Jede externe Schnittstelle wird als `AircraftAdapter` eingebunden. Rohdaten bleiben verlustfrei erhalten; bekannte Werte werden zusätzlich in ein kanonisches Parametermodell normalisiert.

Geplante Adapter:

- DJI Cloud API (MQTT/HTTPS/WebSocket)
- DJI Mobile SDK V5 über Android/RC-Bridge
- DJI Payload SDK über nativen Edge-/Payload-Agent
- DJI Onboard SDK über nativen Agent, soweit vom Fluggerät unterstützt
- optionale weitere Adapter, z. B. MAVLink oder Simulator

## Module

- `packages/aircraft-core` – SDK-neutrale Verträge, Parameter- und Capability-Modell
- `packages/adapters/*` – konkrete SDK-/Protokolladapter
- `apps/*` – Control API, Telemetrie-Ingest, WebSocket-Gateway
- `infra/*` – MQTT, Datenbank und Deployment
- `docs/ARCHITECTURE.md` – verbindliche Architekturregeln

## Leitlinie

Nicht jedes DJI-Modell und nicht jedes SDK stellt dieselben Parameter bereit. FH-Clone unterscheidet deshalb:

1. **Raw Telemetry** – unveränderte Originaldaten des jeweiligen SDKs.
2. **Normalized Telemetry** – einheitliche Schlüssel für UI, Speicherung und Auswertung.
3. **Capabilities** – zur Laufzeit ermittelte Lese-, Schreib- und Steuerungsmöglichkeiten.
4. **Control Authority** – zentrale Freigabe, welcher Adapter ein Fluggerät steuern darf.

So bleibt die Anwendung erweiterbar, ohne Backend oder Frontend für jedes SDK neu zu implementieren.


## Persistente Gateway-Registry

Optional kann die DJI-`update_topo`-Zuordnung in PostgreSQL persistiert
werden. Die Datenbank dient nur Inventar/Diagnose; EMQX-AuthZ bleibt an die
frische Runtime-Topologie gebunden.

Siehe `docs/GATEWAY-REGISTRY.md`.
