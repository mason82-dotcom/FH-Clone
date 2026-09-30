# Changelog

Alle wesentlichen Änderungen an FH-Clone werden hier geführt.

## Unreleased

### V3.1 Entwicklung

- V3.1-Integrationsprogramm auf Basis des unveränderten V3.0.0-Tags gestartet.
- Realen, redigierten RC-Pro-Enterprise-/M3E-Pilot-to-Cloud-MQTT-Capture integriert; das zentrale `M3E_RC_PRO`-Hardware-Evidence-Gate ist für alle Pflichtchecks PASS. `status_reply` bleibt als Outbound-Traffic separat informational.
- Pilot-2-Cloud-Bootstrap für den kontrollierten `thing`-Modul-/MQTT-Verbindungsaufbau integriert, ohne Browser-Secret-Persistenz oder Control-Bootstrap.
- Reales, redigiertes Pilot-2-JSBridge-Hardware-Fixture integriert; Plattformverifikation, Pilot-Version, exakter RC-/Aircraft-Topologie-Match und aktive Thing-Verbindung sind belegt.
- Pilot-2-Evidence-UI gegen verschachtelte Versionsantworten und Navigation außerhalb des DJI-WebViews gehärtet.
- V3.1-Statusdokumentation wird vom historischen V3.0.0-Releaseumfang getrennt geführt.
- TimescaleDB-Backup/Restore als reproduzierbares CI-Betriebsgate ergänzt; Restore bleibt standardmäßig von der aktiven Quelldatenbank getrennt.
- Passive, sanitierte MQTT-Outbound-Evidence für erfolgreiche Basic-Link-Publishes sowie ausgewählte DRC-Qualifikationsframes ergänzt; keine Command-Replay- oder AuthZ-Quelle.
- Interner Prometheus-kompatibler `/metrics`-Endpunkt auf Port 8081 ergänzt; keine Geräteidentitäten als Metriklabels und weiterhin keine Host-Port-Exposition.

## 3.0.0 – 2026-09-29

### Abschluss nach Software-Baseline

- M3E/M3T/M3TA + RC Pro auf den offiziell dokumentierten Cloud-Payload-Control-Vertrag korrigiert; Cloud-Flugsteuerung (`stick_control`/`drone_control`) bleibt für M3 aus.
- M4E/M4T + RC Plus 2 bleibt das separate Cloud-Flight-Control-Profil.
- `ControlCoordinator` wird im Control-API-Prozess tatsächlich instanziiert; Runtime-Status ist read-only sichtbar, öffentliche Flight-Control-Schreibendpunkte bleiben deaktiviert.
- read-only WPML/KMZ-Parser sowie serverseitiger Pilot-Wayline-Katalog integriert; kein Upload, Collect oder Missionsstart.
- Android-MSDK-KeyManager-Runtimeinventar integriert: Operationsflags, read-only Cache-/Hardware-Probes, Component-/Lens-Kontext und Listener-Cleanup; Write-Metadaten erzeugen keine `control.*`-Capability.
- Pilot-2-JSBridge read-only Runtime integriert: Verifikationsstatus, Version, RC-/Aircraft-Identität, Modulstatus und exakter Topologie-Match; credential-/write-fähige Browseraufrufe werden per CI blockiert.
- DJI-Kamera-/Gimbal-Live-Telemetrie kanonisch nach validiertem `payload_index` normalisiert; `cameras[]` und unbekannte Felder bleiben parallel als Raw-Daten erhalten.
- DJI-Telemetrie-Fusion ergänzt: Cloud API und MSDK V5 speisen gemeinsame kanonische Flug-/RTK-Keys; Adapterprovenienz bleibt über `/telemetry/sources` erhalten.
- MediaStore-/Readiness-Integration aus #69 bleibt vollständig erhalten: Persistenz, Startup-Rehydration, `mediaStore.ping()` und Shutdown-Cleanup.
- Persistente Telemetriehistorie ergänzt: sanitierte Raw-Messages und vollständige normalisierte Parameter werden mit Adapter-Provenienz in TimescaleDB gespeichert; ausgewählte fusionierte Flug-/RTK-Werte werden zusätzlich missionsbezogen in `telemetry` projiziert.
- TelemetryStore ist fail-closed an `/ready`, Root-Compose-Migration, Upgrade-Test und deterministischen Shutdown angebunden.
- MSDK-Capability-Status präzisiert: der authentifizierte Agent-Controltransport ist implementiert, während eine öffentliche Operator-/Browser-Control-API weiterhin ausdrücklich deaktiviert bleibt.
- Veraltete Vor-Release-Abnahmecheckliste durch den tatsächlichen post-release Software-Regressionsvertrag ersetzt.
- Öffentliche M3T-Fixture-Metadaten veröffentlichen keine historischen Git-Commit-/Blob-IDs oder entfernten Rohdateipfade mehr; der verpflichtende Control-Policy-Audit verhindert Regressionen.
- Android-MSDK-Medienmanager räumt nach fehlgeschlagenem `enable` registrierte DJI-Media-Listener und den File-Cache auf; ein eigener CI-Regressionstest verhindert doppelte Listener bei späteren Retries.
- DJI-Hardware-Evidence-Vertrag auf den kanonischen Pilot-to-Cloud-Topologiepfad `sys/product/{gateway_sn}/status` vereinheitlicht; die frühere permissive `thing/.../status`-Ausnahme ist entfernt.
- Reale RC-Pro-Enterprise-/M3E-MSDK-Hardwareabnahme abgeschlossen: Pairing, Heartbeat, Control-WebSocket, Server-Reconnect, Stored-Pairing-Resume, Unpair/Revocation, No-Resume nach Unpair und KeyManager-Runtime sind PASS.
- Redigiertes reales MSDK-KeyManager-Fixture mit 42 beobachteten Deskriptoren integriert; Seriennummern, Koordinaten und Credentials werden nicht veröffentlicht.
- GitHub-Sensitive-Data-Removal-Gate abgeschlossen: Support-Cleanup durchgeführt und bekannte historische Commit-/PR-Head-Objekte anschließend nicht mehr direkt auflösbar.

### Plattform

- SDK-neutraler Aircraft Core
- DJI Cloud API / MQTT Adapter
- RC-Pro-/RC-Plus-2-Gateway- und Sub-Device-Topologie
- UgCS Groundstation Adapter und Java-Bridge
- TimescaleDB-/PostgreSQL-Persistenz
- Root-Compose für Control API, EMQX, Web und TimescaleDB
- reproduzierbarer npm-11.19.1-Lockfile-Stand

### Safety und Control

- DJI `cloud_control` explizit aktiviert und als eigenes Produktprofil ausgewiesen
- DJI `stick_control` für unterstützte M4-/RC-Plus-2-Profile aktiviert
- DJI `drone_control` für das unterstützte M4-/RC-Plus-2-Flugsteuerungsprofil aktiviert
- M3-/RC-Pro-Cloud-Control auf Payload-Control begrenzt; keine M3-Cloud-Flugsteuerung
- alle Flugsteuerpfade bleiben hinter FC3/Lease/DJI-Authority/DRC-Session/Dead-Man-Guards
- DJI Dock 1–3, Multi-Dock und PSDK-Payload-/Widget-/DRC-Pfade global deaktiviert
- keine Runtime-/Environment-Schalter zur Aufhebung der globalen Dock-/Multi-Dock-/PSDK-Sperren
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

- M3/RC-Pro-Cloud-Payload-Control ohne reale Payload-/RC-Abnahme
- M4/RC-Plus-2-Cloud-Flight-Control ohne reale DRC-/Authority-Hardwareabnahme
- DJI Dock 1–3 / Multi-Dock / PSDK: global deaktiviert
- Pilot-2-JSBridge
- reale Pilot-2-WPML-/Workspace-Hardwarefreigabe ohne reales Evidence-Fixture
- produktive M3M-Radiometrie ohne reale Capture-Fixtures
- nicht belegte M3T/M4T Thermal-/Tele-Medienpfade
