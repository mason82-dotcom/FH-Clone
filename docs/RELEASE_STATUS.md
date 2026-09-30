# Release-Status: V3.0.0 Basis / V3.1 Entwicklung

Stand: 30.09.2026

## Release-Entscheidung

FH2 V3.0.0 ist als **Software-/FC0-Basisrelease freigegeben**.

Der freigegebene Basisumfang ist fail-closed: Standardstufe ist FC0.
Cloud-Control ist für explizit unterstützte Pilot-to-Cloud-Produktprofile
aktiviert. Für M3E/M3T/M3TA + RC Pro ist es auf Payload-Control begrenzt;
`flightControl`, `stick_control` und `drone_control` bleiben dort aus.
M4E/M4T + RC Plus 2 besitzt das separate Cloud-Flight-Control-Profil.
Flugsteuerung hebt die lokalen Safety-Gates nicht auf und bleibt hinter FC3,
Control Lease, DJI Control Authority, aktiver DRC-Sitzung, Dead-Man und
Hardware-Evidence gegatet.

## Versionsstand

```text
Veröffentlichter Basisrelease: 3.0.0
Git-Tag-/Artefaktgrenze v3.0.0: 8a9544df7ef0460106704db8c31e40f10f23e728
Aktueller Entwicklungszweig: V3.1 auf main
Root-Paketversion während Entwicklung: 3.0.0
Node.js: 22.23.2 in der Direktor-CI
npm: 11.19.1
Root package-lock.json: vorhanden
```

Der Tag `v3.0.0` bleibt unverändert. Änderungen nach
`8a9544df7ef0460106704db8c31e40f10f23e728` gehören zum V3.1-
Entwicklungsstand und verändern die veröffentlichte V3.0.0-Artefaktgrenze
nicht. Die Paketversion wird erst im Rahmen eines eigenen V3.1-Releasegates
angehoben.



## V3.1 Entwicklungsstand

Seit der V3.0.0-Artefaktgrenze sind auf `main` unter anderem folgende
V3.1-Nachweise integriert:

- realer, redigierter RC-Pro-Enterprise-/M3E-Pilot-to-Cloud-MQTT-Capture,
- M3E `update_topo`, Aircraft-OSD, Aircraft-State, Kamera-`payload_index`
  `66-0-0`, RTK-Fixed und separater Nicht-Fixed-Zustand,
- kontrollierter Pilot-2-Cloud-Bootstrap für das DJI-`thing`-Modul,
- self-hosted **read-only** Pilot-Wayline-Listenserver auf dem DJI-kompatiblen
  Workspace-Pfad, mit separatem `x-auth-token`, strengem Workspace-Match und
  weiterhin gesperrten Upload-/STS-/Download-/Execution-Pfaden,
- Pilot-2-Bootstrap lädt das `api`- und `mission`-Modul erst nach
  ausdrücklicher Benutzeraktion; der Wayline-Token wird nicht in
  Browser-Storage oder Build-Variablen persistiert,
- reales, redigiertes Pilot-2-JSBridge-Hardware-Fixture mit
  Plattformverifikation, Pilot-Version, exaktem RC-/Aircraft-Topologie-Match
  und aktiver Thing-Verbindung,
- TimescaleDB-Backup/Restore als echtes Dump-/Restore-Betriebsgate,
- passive sanitierte MQTT-Outbound-Evidence und interner
  Prometheus-`/metrics`-Endpunkt ohne Geräteidentitäten als Labels.

Damit sind die früher als vollständig offen geführten M3E-MQTT- und
Pilot-2-JSBridge-Basisnachweise geschlossen. Der Wayline-Softwarepfad ist
read-only integriert; ein **realer Pilot-2-Wayline-Katalog-/KMZ-Nachweis**
bleibt weiterhin Hardware-Evidence und wird nicht durch den leeren
Self-Hosted-Katalog ersetzt. Noch offene Produktprofile und Medien-Evidence
bleiben davon getrennt.

## Automatische Release-Gates

Die Direktor-CI läuft automatisch für Pull Requests gegen `main` und für
Pushes auf `main`. Ein manueller `workflow_dispatch` bleibt für die strikte
Hardwareabnahme verfügbar.

Bestätigte Software-Gates aus der Direktor-CI:

- Release-Struktur / Root-Compose: PASS
- `npm ci`: PASS
- Build: PASS
- Typecheck: PASS
- Node-/Workspace-Tests: PASS
- UgCS-Bridge: PASS
- TimescaleDB / Migrationen: PASS
- deutsche Pflichtdokumentation: PASS
- zentrale Hardware-Evidence-Auswertung: aktiv; Produkt-Hardwaregates bleiben im normalen `main`-Lauf sichtbar, werden aber erst im strikten `all`-Scope blockierend
- Root-Compose / `scripts/verify.sh`: Bestandteil der finalen Release-CI
- Readiness unterscheidet optionale `disabled`-Abhängigkeiten von konfiguriertem `unavailable`
- Compose-Regressionscheck schützt `control-api -> emqx/timescaledb: service_healthy` und den internen Port 8081
- Verify-Cleanup bewahrt Fehlerstatus, läuft bei INT/TERM über den EXIT-Pfad und macht Cleanup-Fehler bei sonst erfolgreichem Lauf sichtbar
- Shutdown ist idempotent, wartet beide HTTP-Server ab und führt verbleibende Cleanup-Schritte auch nach Teilfehlern weiter aus
- Web-/Proxy-Regressionscheck schützt `/health`, `/ready`, `/api/*`, SPA-Fallback und die Nicht-Exposition von Port 8081
- Persistenzgrenze verhindert FC-Stufe, Control Lease, DJI-Authority und rehydrierbare DRC-Sessions in PostgreSQL; DRC bleibt in-memory
- AuthZ erlaubt den Topologie-Bootstrap ausschließlich auf `sys/product/{gateway_sn}/status`; der veraltete `thing/.../status`-Pfad ist deny
- Frontend-Polling arbeitet single-flight: langsame Requests werden nicht mehr bei jedem Intervall-Tick abgebrochen; Abort bleibt auf Cleanup/Unmount begrenzt
- RTK-SSE validiert Snapshot-, Status- und Fix-Transition-Strukturen zur Laufzeit und ignoriert syntaktisch gültige, aber strukturell ungültige Events

## Hardware-Evidence

Hardware-Nachweise werden zentral durch
`scripts/hardware-evidence-audit.mjs` ausgewertet. Synthetische Daten zählen
nicht als reale Hardwareevidenz.

Bereits real belegt:

- zwei M3T-Wide-Aufnahmen
- M3T-EXIF/XMP-Felder einschließlich eines dateiseitigen RTK-Fixed-Samples
- reales M4T-Wide-Metadatenbeispiel im Projektbestand
- reales, redigiertes MSDK-V5-KeyManager-Runtime-Fixture von RC Pro Enterprise + Mavic 3 Enterprise
- KeyManager-Inventar mit 42 beobachteten Deskriptoren; `supported`, Write-/Action-Metadaten und lens-spezifischer Kamera-Kontext sind per Hardware-Audit belegt
- reales, redigiertes RC-Pro-Enterprise-/M3E-MQTT-Fixture mit `update_topo`,
  Aircraft-OSD/-State, Batterie, Kamera-`payload_index` und RTK-Fixed/Nicht-Fixed
- reale Pilot-2-JSBridge-Session mit verifizierter Plattform, Pilot-Version,
  exaktem Topologie-Paar, Modul-Inventar und aktiver Thing-Verbindung

Noch nicht vollständig real belegt:

- M3T MQTT `update_topo` / OSD / State / `cameras[]` / Batterie / RTK-Paar
- M3T Tele und Thermal-R-JPEG
- M4T RC-Plus-2-DRC-Heartbeat-/Authority-Hardwarekette
- M4T Thermal-Medienfixture
- realer M3M Narrow-Band-Capture-Satz
- reales Pilot-2-WPML-KMZ / Workspace-Katalog

Diese fehlenden Nachweise werden in der CI als Hardwarestatus sichtbar
geführt. Sie werden **nicht** durch synthetische Fixtures ersetzt.

## Finaler 3.0.0-Releaseumfang

Der folgende Stand umfasst die historische 3.0.0-Software-Baseline plus alle
seitdem auf `main` integrierten und softwareseitig abgenommenen
3.0.0-Erweiterungen/Härtungen. Nach Abschluss des GitHub-Hosting-Cleanup-Gates
ist dieser Gesamtstand der finale Releaseumfang; die Veröffentlichung erfolgt
auf dem nach diesem Abschluss-PR vollständig grünen `main`.

- SDK-neutraler Aircraft Core
- SafetyGate FC0..FC3 mit FC0 als Standard
- Control Lease / Control Authority
- DJI Cloud API Basic-Link / MQTT
- Gateway-/Sub-Device-Topologie
- normalisierte Telemetrie
- korrigierte DJI-Felder `attitude_pitch` / `attitude_roll`
- RTK-/GNSS-Normalisierung und read-only API
- Missionsbeobachtung / Runtime-Metadaten
- EMQX HTTP AuthN/AuthZ mit Default-Deny
- PostgreSQL/TimescaleDB-Persistenz
- AuthZ-Audit
- Media-/Multispektral-Core und NDVI-Vertrag
- kanonische DJI-Kamera-/Gimbal-Telemetrie nach gültigem `payload_index`, bei vollständiger Raw-Retention
- adapterübergreifende DJI-Telemetrie-Fusion mit Quellenprovenienz für Cloud API und MSDK V5
- MediaStore-Persistenz mit Startup-Rehydration und fail-closed Readiness bleibt integriert
- dauerhafte RawMessage-Historie und vollständige normalisierte Parameterhistorie mit Adapter-Provenienz
- missionsbezogene Telemetrieprojektion in `telemetry` plus bestehendes `telemetry_1m`
- TelemetryStore ist in Readiness, Root-Compose-Migration und Shutdown integriert
- UgCS Groundstation Adapter / Bridge
- FlightHub-2 OpenAPI V2 read-only
- DJI WPML/KMZ read-only Parser und Pilot-Wayline-Katalog
- Android MSDK V5 KeyManager-Runtimeinventar mit read-only Hardware-Probes; RC Pro Enterprise + M3E real hardwareseitig belegt
- Android-MSDK-MediaManager bereinigt Listener/Cache auch nach fehlgeschlagenem Enable und ist per CI-Regressionstest abgesichert
- authentifizierter MSDK-Agent-Controltransport ist softwareseitig implementiert; öffentliche Operator-Control-API bleibt deaktiviert
- Pilot 2 JSBridge read-only Runtime für Verifikation, Identität und Modulstatus
- zentrale DJI-`ControlCoordinator`-Runtime im Serverprozess
- read-only Control-Runtime-Status; keine öffentliche Flight-Control-Write-API
- Weboberfläche und lokale Root-Compose-Runtime

## Globale Produkt-Policy

Seit dem Policy-Update sind **DJI Dock 1, Dock 2, Dock 3, Multi-Dock und
PSDK-Payloads projektweit deaktiviert**. Cloud-Control selbst bleibt
produktabhängig: M3 + RC Pro erlaubt nur Payload-Control; M4 + RC Plus 2
erlaubt das separate Cloud-Flight-Control-Profil. `stick_control` und
`drone_control` werden nur im M4-Profil und innerhalb der bestehenden
Safety-/Authority-/DRC-Kette verwendet.

## Nicht als Hardwarefunktion freigegeben

Folgende Pfade sind in V3.0.0 nicht Teil der Hardware-Supportzusage:

- M3E/M3T/M3TA Cloud-Payload-Control ohne reale RC-Pro-/Payload-Abnahme
- M4E/M4T Cloud-Flight-Control ohne reale RC-Plus-2-/DRC-/Authority-Abnahme
- DJI Dock 1–3 / Multi-Dock / PSDK-Payloads: **global deaktiviert**
- Pilot-2-JSBridge-Hardwarefreigabe ohne reales WebView-Evidence-Fixture
- reale Pilot-2-WPML-/Workspace-Hardwarefreigabe ohne passendes reales KMZ-/Workspace-Fixture
- produktive M3M-Radiometrie/NDVI ohne reale M3M-Fixtures
- M3T/M4T Thermal-Auswertung ohne passendes reales Thermal-Fixture
- weitere MSDK-KeyManager-Produkt-/Firmwareprofile außerhalb des real belegten RC-Pro-Enterprise-/M3E-Profils

## Release-Vorbereitung

Die vollständigen vorbereiteten Release Notes stehen in
`docs/RELEASE_NOTES_3.0.0.md`.

Das GitHub-Sensitive-Data-Removal-Gate (#73) ist abgeschlossen: GitHub Support
hat den serverseitigen Cleanup durchgeführt, die bekannten historischen
Commit-Objekte sind nicht mehr direkt auflösbar und die betroffenen alten
PR-Head-Commits sind nicht mehr erreichbar.

Nach Merge dieses Abschluss-PRs sind nur noch die finale grüne Direktor- und
Android-MSDK-CI sowie anschließend Tag und GitHub Release auszuführen.
WPML/Pilot-Waylines sind als read-only Softwarepfad integriert; reale
Pilot-2-WPML-/Workspace-Hardwarefreigabe bleibt separat offen.

## Release-Regel

```text
Software-CI grün
+ Root-Runtime-Verify grün
+ FC0 bleibt Default
+ Hardware-Evidence transparent dokumentiert
= V3.0.0 Basisrelease

Hardwareprofil erst freigeben
+ reale Hardwareevidence im strikten `all`-Scope grün
= jeweilige Hardware-Supportfreigabe

Fehlende `REQUIRED_HARDWARE`-Fixtures sind damit kein versteckter grüner
Softwaretest: sie erscheinen als `PENDING`, werden bei der gezielten
Hardwareabnahme jedoch zu echten blockierenden Gates.
```
