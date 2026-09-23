# Changelog

Alle wesentlichen Änderungen an FH-Clone werden hier geführt.

## Unreleased

### Policy

- DJI Dock 1, Dock 2 und Dock 3 global deaktiviert (`domain=3`)
- Multi-Dock Runtime und Hardware-Gates entfernt
- PSDK-Payload-/Widget-/DRC-Methoden global gesperrt
- PSDK- und Multi-Dock-Telemetrie vor Persistenz/Normalisierung gefiltert
- native DJI-Kamera-Payloads M3T/M4T bleiben unterstützt

Keine Änderungen. V3.0.0 ist der eingefrorene Basisstand.

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

- M4T FC3/DRC ohne reale Hardwareabnahme
- Dock3/M4D/M4TD
- Pilot-2-JSBridge
- vollständige WPML/Pilot-Wayline-Integration
- produktive M3M-Radiometrie ohne reale Capture-Fixtures
- nicht belegte M3T/M4T Thermal-/Tele-Medienpfade
