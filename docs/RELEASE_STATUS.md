# V3.0 Release-Status

Stand: 23.09.2026

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
Release: 3.0.0
Node.js: 22.23.2 in der Direktor-CI
npm: 11.19.1
Root package-lock.json: vorhanden
```

Die Versionsnummer 3.0.0 ist für Root, Node-Workspaces, Lockfile und
UgCS-Maven-Modul vereinheitlicht.

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
- zentrale Hardware-Evidence-Auswertung: aktiv
- Root-Compose / `scripts/verify.sh`: Bestandteil der finalen Release-CI
- Readiness unterscheidet optionale `disabled`-Abhängigkeiten von konfiguriertem `unavailable`
- Compose-Regressionscheck schützt `control-api -> emqx/timescaledb: service_healthy` und den internen Port 8081
- Verify-Cleanup bewahrt Fehlerstatus, läuft bei INT/TERM über den EXIT-Pfad und macht Cleanup-Fehler bei sonst erfolgreichem Lauf sichtbar
- Shutdown ist idempotent, wartet beide HTTP-Server ab und führt verbleibende Cleanup-Schritte auch nach Teilfehlern weiter aus

## Hardware-Evidence

Hardware-Nachweise werden zentral durch
`scripts/hardware-evidence-audit.mjs` ausgewertet. Synthetische Daten zählen
nicht als reale Hardwareevidenz.

Bereits real belegt:

- zwei M3T-Wide-Aufnahmen
- M3T-EXIF/XMP-Felder einschließlich eines dateiseitigen RTK-Fixed-Samples
- reales M4T-Wide-Metadatenbeispiel im Projektbestand

Noch nicht vollständig real belegt:

- M3T MQTT `update_topo` / OSD / State / `cameras[]` / Batterie / RTK-Paar
- M3T Tele und Thermal-R-JPEG
- M4T RC-Plus-2-DRC-Heartbeat-/Authority-Hardwarekette
- M4T Thermal-Medienfixture
- realer M3M Narrow-Band-Capture-Satz
- reales Pilot-2-WPML-KMZ / Workspace-Katalog
- reale Pilot-2-JSBridge-Session

Diese fehlenden Nachweise werden in der CI als Hardwarestatus sichtbar
geführt. Sie werden **nicht** durch synthetische Fixtures ersetzt.

## Freigegebener V3.0.0-Basisumfang

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
- UgCS Groundstation Adapter / Bridge
- FlightHub-2 OpenAPI V2 read-only
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
- Pilot-2-JSBridge
- WPML/Pilot-Wayline-Integration aus den offenen Drafts
- produktive M3M-Radiometrie/NDVI ohne reale M3M-Fixtures
- M3T/M4T Thermal-Auswertung ohne passendes reales Thermal-Fixture

## Offene Draft-PRs

Für den Basisrelease werden keine offenen Feature-Drafts übernommen.

- #44 MSDK KeyManager-Vertrag: Vertrags-/Dokumentationsstand; nach V3.0 verschoben
- #46 Pilot2 JSBridge: noch nicht releasefähig; reales Pilot-2-Runtime-Fixture offen
- #51 aktuelle WPML-Integration: Draft; Parser-Test für `actionUUID` schlägt fehl und reales Pilot-2-WPML-/Workspace-Fixture fehlt

Die älteren WPML-Drafts #45/#47/#49 wurden in #51 konsolidiert und gehören
nicht zum V3.0.0-Release.

## Release-Regel

```text
Software-CI grün
+ Root-Runtime-Verify grün
+ FC0 bleibt Default
+ Hardware-Evidence transparent dokumentiert
= V3.0.0 Basisrelease

Hardwareprofil erst freigeben
+ reale Hardwareevidence grün
= jeweilige Hardware-Supportfreigabe
```
