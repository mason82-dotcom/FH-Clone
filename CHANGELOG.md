# Changelog

Alle wesentlichen Änderungen an FH-Clone werden hier geführt.

## Unreleased

Keine Änderungen nach der V3.0.0-Freigabe.

## 3.0.0 – 2026-09-23

### Plattform

- SDK-neutraler Aircraft Core
- DJI Cloud API / MQTT Adapter
- RC-Pro-/RC-Plus-2-Gateway- und Sub-Device-Topologie
- UgCS Groundstation Adapter und Java-Bridge
- TimescaleDB-/PostgreSQL-Persistenz
- Root-Compose für Control API, EMQX, Web und TimescaleDB
- reproduzierbarer npm-11.19.1-Lockfile-Stand

### Safety und Control

- DJI Cloud `stick_control` und Legacy-`drone_control` projektweit fail-closed deaktiviert
- DJI Dock 1–3, Multi-Dock und PSDK-Payload-/Widget-/DRC-Pfade global deaktiviert
- keine Runtime-/Environment-Schalter zur Umgehung dieser globalen Sperren
- native DJI-Kamera-Payloads M3T/M4T bleiben davon unberührt
- SafetyGate FC0..FC3
- FC0 als Standard
- Control Lease und Control Authority
- DJI Cloud-Control-Authority
- getrennte Basic-Link-/DRC-Sicherheitsdomänen
- DRC Session Manager mit Dead-Man
- Transport-Recovery
- keine öffentliche automatische FC3-Freigabe

### Security

- EMQX Default-Deny
- HTTP AuthN/AuthZ
- serverseitige Gateway-Credential-Bindung
- Runtime-only Topology-/DRC-Autorisierung
- AuthZ-Audit
- fail-closed interne Fehlerbehandlung
- keine Browser-MQTT-Credentials

### Telemetrie, RTK, Mission und Media

- normalisierte DJI-Telemetrie
- RTK-/GNSS-Normalisierung und Live-API
- Missionsbeobachtung und Persistenz
- herstellerneutraler Media-/Multispektral-Core
- NDVI READY/PARTIAL/NOT_NDVI_CAPABLE
- reale M3T-Wide-EXIF/XMP-Evidenz
- DJI `attitude_pitch` / `attitude_roll` kanonisch korrigiert
- FlightHub-2 OpenAPI V2 read-only

### Release-CI

- automatische PR-/main-Direktor-CI
- npm ci / Build / Typecheck / Tests
- Root-Compose-Struktur
- UgCS-Build
- TimescaleDB/Migrationen
- vollständige Root-Runtime-`verify.sh`-Abnahme
- zentrale reale DJI-Hardware-Evidence-Matrix
- automatische Analyse der offenen DJI-Drafts

### Nicht im V3.0.0-Hardware-Supportumfang

- manuelle DJI-Cloud-Flugsteuerung: global deaktiviert
- DJI Dock 1–3 / Multi-Dock / PSDK: global deaktiviert
- Pilot-2-JSBridge
- vollständige WPML/Pilot-Wayline-Integration
- produktive M3M-Radiometrie ohne reale Capture-Fixtures
- nicht belegte M3T/M4T Thermal-/Tele-Medienpfade
