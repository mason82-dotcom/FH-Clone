# Tests und Abnahme

Stand: 23.09.2026

## Zweck

Dieses Dokument beschreibt den aktuellen Software-Abnahmestand von FH2 auf
`main`. Reale DJI-Hardware-Evidence wird getrennt geführt und ist keine
Voraussetzung für die Software-/FC0-Basisfreigabe.

Verbindliche Hardware-Nachweise stehen in
[HARDWARE_EVIDENCE.md](HARDWARE_EVIDENCE.md).

## Software-Basisstand

FH2 V3.0.0 ist als Software-/FC0-Basisrelease freigegeben. Änderungen nach der
3.0.0-Basis werden weiterhin durch dieselben automatischen Regressionsgates
abgesichert.

Die Standard-Safety-Stufe bleibt FC0. Ein grüner Build oder ein erkanntes
Produktprofil erzeugt keine Flight-Control-Berechtigung.

## Automatische Direktor-CI

Workflow:

```text
.github/workflows/director-v3-validation.yml
```

Trigger:

- Pull Requests gegen `main`
- Pushes auf `main`
- manueller `workflow_dispatch` für zusätzliche Abnahmeparameter

Der Workflow prüft softwareseitig:

- Repository-/Release-Struktur
- reproduzierbares `npm ci` mit npm 11.19.1
- TypeScript-/Web-Build
- Typecheck
- Node-/Workspace-Tests
- Pilot-2-JSBridge-Safety-Scan
- UgCS-Bridge-Build
- TimescaleDB-Schema und Migrationen
- Upgrade-Pfad für bestehende Volumes
- Root-Compose und `scripts/verify.sh`
- deutsche Pflichtdokumentation und Control-Policy
- separat ausgewiesene Hardware-Evidence

Fehlende reale Hardware-Evidence wird nicht durch synthetische Fixtures ersetzt.

## Build- und Testgate

Aktueller Softwarevertrag:

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run test:pilot2-jsbridge
npm run verify:pilot2-jsbridge
```

Die automatisierte Suite deckt unter anderem ab:

- SafetyGate und ControlAuthority
- Device-/ParameterRegistry
- DJI-Normalisierung und Telemetriefusion
- TopologyRegistry und AuthZ
- EMQX AuthN und Gateway-Credential-Bindung
- Default-Deny und Basic-Link-/DRC-Trennung
- DRC Session Manager und Dead-Man-Verhalten
- ControlCoordinator-Guards
- MSDK Pairing, Heartbeat, WSS-Control und Unpair/Revocation
- MSDK Normalisierung und Hardware-Evidence-Validator
- Mission-/Wayline-Beobachtung
- RTK-/GNSS-Normalisierung und Zustandswechsel
- Media-/M3M-/NDVI-Verträge
- MediaStore, TelemetryStore und Persistenzgrenzen
- Shutdown-/Cleanup-Verhalten
- Web-/Proxy-Grenzen

## Runtime-Gate

Der Root-Compose startet gemeinsam:

```text
control-api
emqx
web
timescaledb
```

Optional:

```text
ugcs-bridge
```

`scripts/verify.sh` prüft insbesondere:

- Health und Readiness
- interne Service-Erreichbarkeit
- EMQX und TimescaleDB
- öffentliche Weboberfläche
- Nicht-Exposition des internen Ports 8081
- Default-Deny
- FC0 als Default
- keine öffentliche Flight-Control-Write-API
- kontrollierten Cleanup beim Abbruch oder Fehler

## Persistenz- und Restart-Gate

Automatisiert abgesichert:

- offene automatische Missionen werden nach Dienstneustart mit
  `service_restart` abgeschlossen
- historische Topologie erzeugt keine aktuelle AuthZ-Berechtigung
- DRC-Sessions, FC-Stufe, Lease und DJI-Authority werden nicht aus PostgreSQL
  rehydriert
- Gateway-Credentials und Token-Revocations bleiben getrennt von
  Runtime-Control-Rechten
- MediaAssets werden persistiert und read-only rehydriert
- sanitierte Raw-Messages werden in `raw_messages` persistiert
- normalisierte Parameter werden mit Adapter-Provenienz in
  `normalized_parameters` persistiert
- ausgewählte fusionierte Missionswerte werden in `telemetry` projiziert
- bestehende Volumes erhalten neue Tabellen über den idempotenten
  One-Shot-Migrator
- konfigurierte, aber nicht erreichbare Persistenz macht `/ready` fail-closed

Retention und Backup-/Restore-Kapazitätsplanung bleiben Betriebsaufgaben und
keine Quelle für Runtime-Autorisierung.

## MQTT-Sicherheits-Gate

Automatisiert abgesichert:

- unbekannter Principal -> deny
- falsches oder deaktiviertes Credential -> deny
- Credential ist serverseitig an `gateway_sn` gebunden
- MQTT-`clientid` ist keine Security Identity
- fremde Gateway-/Aircraft-Topics -> deny
- Topologie-Bootstrap nur über den kanonisch erlaubten Statuspfad
- entfernte Runtime-Topologie erzeugt keine historischen Rechte
- Basic Link besitzt keine permanenten DRC-Rechte
- dynamische AuthN/AuthZ-Backendfehler bleiben fail-closed
- Audit speichert keine Auth-Secrets

## MSDK-Softwaregate

Der native RC-Bridge-Pfad ist softwareseitig integriert:

```text
Pair
 -> Heartbeat
 -> authentifizierter WSS-Agent-Kanal
 -> FC3 + Lease + lokales Arm + VirtualStick-Support
 -> Session
 -> Neutralisierung / Stop
 -> Unpair / Token-Revocation
```

Die Control API meldet deshalb:

```text
networkControlImplemented = true
publicOperatorControlApiEnabled = false
```

Das bedeutet: Der authentifizierte Backend-zu-Agent-Controltransport ist
implementiert. Es existiert weiterhin absichtlich **kein** öffentlicher
Browser-/Operator-Schreibendpunkt, der eine Control-Session öffnet oder
Stickwerte einspeist.

## Mission, WPML und Wayline

Softwareseitig gilt:

- `mode_code == 5` ist Wayline-Telemetrieevidenz
- beobachtete Wayline erzeugt keine erfundene Wayline-ID
- WPML/KMZ-Parser ist read-only integriert
- Pilot-Wayline-Katalog ist read-only integriert
- `mission.wayline` wird nicht allein aus Produktsupport beworben
- Upload, Collect und Mission Execution sind nicht Teil des V3.0.0-Basisumfangs

Verbindliche Invariante:

```text
Wayline beobachtet
  !=
Wayline Management implementiert
  !=
mission.wayline ausführbar
```

## Hardwareprofil-Gates

Reale Hardware-Nachweise bleiben getrennt offen. Dazu gehören unter anderem:

- RC Pro Enterprise / M3E-M3T-M3TA MQTT- und Payload-Pfade
- RC Plus 2 / M4E-M4T DRC-/Authority-Kette
- M3M Narrow-Band-/Radiometrie-Fixtures
- M3T/M4T Thermal-/Tele-Medienfixtures
- Pilot-2-JSBridge-Session
- Pilot-2-WPML-/Workspace-Fixtures
- MSDK-KeyManager- und Pairing-/Transport-Evidence

Diese Punkte verändern den Softwarestatus nicht und dürfen vor einer konkreten
Hardware-Supportzusage nicht als bestätigt dargestellt werden.

## Freigaberegel

Für Softwareänderungen nach der V3.0.0-Basis gilt:

```text
PR basiert auf aktuellem main
+ Build/Typecheck/Tests grün
+ Root-Runtime grün
+ Migrationen grün
+ Doku/Policy grün
+ Safety-Grenzen unverändert oder explizit geprüft
= softwareseitig integrierbar
```

Für eine konkrete Hardware-Supportzusage kommt zusätzlich das passende reale
Hardwareprofil-Gate hinzu.
