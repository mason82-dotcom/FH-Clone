# FH2 V3.0.0 – Release Notes

Status: **final; Veröffentlichung nach grüner CI des Abschlusscommits**

Stand: 29.09.2026

## Artefaktgrenze

FH2 V3.0.0 wird **nicht** rückwirkend auf den historischen
Software-Baseline-Commit getaggt.

Das Repository-/Hosting-Cleanup-Gate wurde am 29.09.2026 nach dem
GitHub-Support-Cleanup und der Nicht-Erreichbarkeitsprüfung der bekannten
Altobjekte abgeschlossen. Der Tag `v3.0.0` liegt deshalb auf dem finalen,
vollständig durch Direktor- und Android-CI validierten `main` nach diesem
Abschluss-PR.

Damit gehören alle bis zu dieser finalen Tag-Grenze integrierten
3.0.0-Komponenten zum veröffentlichten Artefakt. Ein Zurücktaggen auf einen
älteren Zwischenstand wäre technisch irreführend, weil alle Node-Workspaces
und die UgCS-Bridge konsistent Version `3.0.0` tragen.

## Softwareumfang

V3.0.0 enthält insbesondere:

- SDK-neutralen Aircraft Core
- FC0..FC3 SafetyGate mit FC0 als Standard
- Control Lease und Control Authority
- DJI Cloud API / MQTT Basic Link
- EMQX HTTP AuthN/AuthZ mit serverseitiger Gateway-Bindung und Default-Deny
- Gateway-/Aircraft-Topologie
- DJI Cloud-Control-Authority
- DRC Session Manager und Dead-Man
- M3E/M3T/M3TA + RC Pro als Cloud-Payload-Control-Profil ohne Cloud-Flugsteuerung
- M4E/M4T + RC Plus 2 als getrenntes Cloud-Flight-Control-Profil
- RTK-/GNSS-Normalisierung
- Missionserkennung und Missionspersistenz
- Media-/Multispektral-Core und NDVI-Vertrag
- FlightHub-2 OpenAPI V2 read-only
- DJI WPML/KMZ read-only Parser und Pilot-Wayline-Katalog
- Android MSDK V5 RC-Bridge mit Pairing, Heartbeat, WSS-Agent-Kanal,
  Unpair/Revocation und KeyManager-Runtimeinventar
- reale RC-Pro-Enterprise-/M3E-MSDK-Abnahme für Pairing, Heartbeat,
  Reconnect, Stored-Pairing-Resume, Unpair/Revocation und KeyManager-Runtime
- fail-closed MediaManager-Lifecycle: fehlgeschlagenes Enable entfernt
  registrierte Media-Listener vor einem späteren Retry
- Pilot-2-JSBridge read-only Runtime
- DJI Cloud/MSDK-Telemetriefusion mit Adapter-Provenienz
- MediaStore-Persistenz
- sanitierte RawMessage-Historie
- vollständige normalisierte Parameterhistorie
- missionsbezogene Telemetrieprojektion in TimescaleDB
- UgCS Groundstation Adapter und Java-Bridge
- Root-Compose für Control API, EMQX, Web und TimescaleDB
- reproduzierbaren npm-11.19.1-/Node-22.23.2-Stand

## Safety- und Security-Grenzen

V3.0.0 ändert die fail-closed Grundhaltung nicht:

```text
FC0 = Default
```

Flugkritische Steuerung benötigt weiterhin mindestens:

```text
unterstütztes Produktprofil
+ FC3
+ gültiger Control Lease
+ DJI Control Authority
+ aktive DRC-Sitzung
+ Dead-Man
```

Zusätzlich gilt:

- keine öffentliche Browser-/Operator-Flight-Control-Write-API
- keine Control-Lease-/Authority-/DRC-Rehydrierung aus PostgreSQL
- MQTT-Client-ID ist keine Sicherheitsidentität
- historische Topologie ist keine aktuelle AuthZ-Quelle
- Credential-/Secret-artige Telemetriedaten werden vor Persistenz fail-closed
  abgefangen
- DJI Dock 1–3, Multi-Dock und PSDK-Payloadpfade bleiben projektweit deaktiviert

## Nicht als reale Hardwarefunktion zugesagt

Die Softwareimplementierung ist nicht gleichbedeutend mit realer
Hardwarefreigabe. Insbesondere bleiben ohne passende Hardware-Evidence nicht
als produktiv zugesagt:

- M3E/M3T/M3TA Cloud-Payload-Control
- M4E/M4T Cloud-Flight-Control
- M3T/M4T Tele-/Thermal-Medienpfade
- produktive M3M-Radiometrie/NDVI
- Pilot-2-WPML-/Workspace-Hardwarefreigabe
- Pilot-2-JSBridge-Hardwarefreigabe
- weitere MSDK-KeyManager-Produkt-/Firmwareprofile außerhalb des real
  belegten RC-Pro-Enterprise-/M3E-Profils

Diese Grenzen werden in `docs/HARDWARE_EVIDENCE.md` geführt.

## Software-Abnahme

Der aktuelle Release-Kandidat wird durch zwei automatische Workflows geprüft.

Direktor-CI:

- Release-/Repository-Struktur
- reproduzierbares `npm ci`
- Build
- Typecheck
- Node-/Workspace-Tests
- Pilot-2-JSBridge-Safety
- UgCS-Build
- TimescaleDB Fresh-/Upgrade-Migration
- Root-Compose / Runtime Verify
- Dokumentations-/Control-Policy-Audit

Android-MSDK-CI:

- Workspace-Build
- MSDK-Bridge-Tests
- MSDK-Media-Lifecycle-Regressionstest
- Hardware-Evidence-Validator-Tests
- Android `assembleDebug`
- Android Lint
- Hardware-Test-APK-Paketierung

Fehlende reale Hardware-Evidence wird als eigener Status geführt und ersetzt
keinen Softwaretest.

## Release-Freigabe

Das separate Repository-/Hosting-Cleanup-Gate ist abgeschlossen. GitHub
Support hat die verbliebenen serverseitigen Referenzen/Objekte bereinigt; die
anschließende Prüfung konnte die bekannten historischen Commit-Objekte und
betroffenen alten PR-Head-Commits nicht mehr auflösen.

Für die Veröffentlichung gilt damit:

```text
VERSION = 3.0.0
HOSTING_CLEANUP = PASS
SOFTWARE_CANDIDATE = READY
FINAL_CI = REQUIRED
TAG = v3.0.0 nach grüner finaler CI
GITHUB_RELEASE = nach v3.0.0-Tag
```

Der nach diesem Abschluss-PR vollständig grüne `main`-Commit ist die finale
`v3.0.0`-Artefaktgrenze.
