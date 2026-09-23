# FH2 V3.0.0 – Release Notes

Status: **vorbereitet, noch nicht veröffentlicht**

Stand der Vorbereitung: 23.09.2026

## Artefaktgrenze

FH2 V3.0.0 wird **nicht** rückwirkend auf den historischen
Software-Baseline-Commit getaggt.

Der Tag `v3.0.0` soll nach Abschluss des verbleibenden
Repository-/Hosting-Cleanup-Gates auf dem dann aktuellen, vollständig durch
Direktor- und Android-CI validierten `main` liegen.

Damit gehören alle bis zu dieser finalen Tag-Grenze integrierten
3.0.0-Komponenten zum veröffentlichten Artefakt. Ein späteres Zurücktaggen auf
einen älteren Zwischenstand wäre technisch irreführend, weil alle Node-
Workspaces und die UgCS-Bridge bereits konsistent Version `3.0.0` tragen.

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
- vollständige MSDK-KeyManager-Hardwarematrix

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

## Verbleibendes Release-Gate

Vor Erstellung von `v3.0.0` und dem GitHub Release muss das separate
Repository-/Hosting-Cleanup-Gate abgeschlossen sein. Bis dahin gilt:

```text
TAG = NO
GITHUB_RELEASE = NO
VERSION = 3.0.0
SOFTWARE_CANDIDATE = READY
```

Nach Abschluss dieses Gates wird der dann aktuelle grüne `main`-Commit zur
finalen `v3.0.0`-Artefaktgrenze.
