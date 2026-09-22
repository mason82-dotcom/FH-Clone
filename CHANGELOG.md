# Changelog

Alle wesentlichen Änderungen an FH-Clone werden hier für den V3-Abschluss
zusammengeführt.

## Unreleased

### Architektur

- SDK-neutraler Aircraft Core
- DJI Cloud API / MQTT Adapter
- RC-Pro-/RC-Plus-2-Gateway- und Sub-Device-Topologie
- UgCS Groundstation Adapter
- TimescaleDB-/PostgreSQL-Persistenzbausteine

### Safety und Control

- SafetyGate FC0..FC3
- Control Lease und Control Authority
- DJI Cloud-Control-Authority
- getrennte Basic-Link-/DRC-Sicherheitsdomänen
- DRC Session Manager mit Dead-Man
- DRC Transport und Recovery
- V3 Control Coordinator

### Security

- EMQX Default-Deny
- dynamische HTTP AuthN/AuthZ-Architektur
- trusted Gateway Identity als Zielmodell
- Runtime-only Topology-/DRC-Autorisierung
- keine Browser-MQTT-Credentials

### RTK, Mission und Media

- RTK-/GNSS-Normalisierung
- RTK-Live-API und WebUI
- Missions-/RTK-Metadaten
- Media-/Multispektral-Vertrag in V3-Konvergenz

### Noch nicht freigegeben

- finaler Root-Compose
- finale RC-Pro-Hardwareabnahme
- finaler Multispektral-/NDVI-Vertrag
- vollständige V3-Test-/Safety-Abnahme
- Direktor-CI
- Version `3.0.0`

## 3.0.0

Noch nicht veröffentlicht.

Dieser Abschnitt wird erst beim freigegebenen Release Candidate/finalen
V3-Release mit Datum und finalen Release Notes ausgefüllt.
