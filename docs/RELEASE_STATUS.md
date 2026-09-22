# V3.0 Release-Status

Stand: 22.09.2026

Dieses Dokument ist die aktuelle Direktor-Sicht auf den V3-Abschluss.

Kanonischer Stand:

```text
main = 25fd1435c14820c94ae7e281da685e3a532158e9
```

## Versionsstatus

Aktuell:

```text
package.json = 0.1.0
V3.0         = noch nicht freigegeben
```

`3.0.0` wird erst nach bestandenen Release-Gates und erfolgreicher
Direktor-CI gesetzt. Es existiert noch kein finaler V3-Tag.

## Bereits konsolidierte Merge-Kandidaten

Folgende V3-Kandidaten sind auf `main` übernommen:

- PR #21 – konsolidierte DRC-Control-Integration
- PR #22 – Release-Status / Changelog / Doku-Bereinigung
- PR #24 – AuthZ-Reason-Vertrag und gepuffertes Audit
- PR #30 – erweiterte Root-Verify-Healthchecks
- PR #32 – robuster Verify-Credential-/Marker-Cleanup
- PR #34 – Basic-Link/DRC-Trennung mit Regressionstest
- PR #35 – herstellerneutraler Media-/NDVI-Core-Vertrag

Bewusst **nicht** gemergt:

- PR #18 – durch #21 ersetzt
- PR #19 – durch #24 ersetzt
- ältere RC-Pro-/EMQX-/Gateway-/Mission-Branches – durch ihre aktuellen
  Direktor-Integrationen ersetzt

Damit existiert derzeit kein offener fachlicher Merge-Kandidat. Neue Änderungen
dürfen nur noch konkrete V3-Gates oder reproduzierbare Release-Defekte schließen.

## Gate 1 – Build: OFFEN

Vorhanden:

- Root-Workspace
- `npm run build`
- `npm run typecheck`
- `npm test`
- Web-Workspace
- UgCS-Bridge

Noch erforderlich:

- `package-lock.json` im Repository-Root
- damit reproduzierbares `npm ci`
- lokaler kompletter Build-/Testnachweis

## Gate 2 – Runtime: IMPLEMENTIERT, LOKALE ABNAHME OFFEN

Auf `main` vorhanden:

- Root-`compose.yaml`
- Root-`.env.example`
- `control-api`
- `emqx`
- `web`
- `timescaledb`
- getrennte Frontend-/Backend-/MQTT-Netze
- interner Port 8081 ohne Host-Publishing
- `GET /health`
- `GET /ready`
- Docker-Healthchecks
- `scripts/verify.sh`
- TimescaleDB-Restartprüfung
- AuthN-Fail-Closed-Prüfung
- EMQX-5.7-`emqx.conf`

Noch erforderlich:

- tatsächliche lokale Ausführung von `scripts/verify.sh`
- belegter erfolgreicher Compose-Build
- belegte Readiness nach DB-Restart
- lokaler MQTT-/AuthN-Verbindungsnachweis

## Gate 3 – Tests: WEITGEHEND IMPLEMENTIERT, AUSFÜHRUNG DURCH R1 BLOCKIERT

Automatisiert vorhanden sind unter anderem:

- AuthZ
- AuthZ-Reason-Taxonomie
- AuthZ-Audit-Selektion/Pufferung
- Missionssitzung
- DRC-Sitzung
- Dead-Man
- Runtime-DRC-Session-ID
- DRC-Recovery/Transportverlust
- Basic-Link ohne DRC-Defaulttopics
- Media-/NDVI-Validierung

Die finale lokale Gesamtabnahme bleibt wegen fehlendem Root-`package-lock.json`
und damit nicht ausführbarem `npm ci` offen.

## DJI-MQTT/AuthN – IMPLEMENTIERT, LOKALE ABNAHME OFFEN

Der EMQX-5.7-Vertrag ist fachlich entschieden:

- `POST /internal/emqx/authn`
- HTTP 200 + `allow/deny`
- `is_superuser=false`
- `client_attrs.role=dji_gateway`
- `client_attrs.gateway_sn`
- kein `expire_at` im 5.7-Profil
- Credential Store darf PostgreSQL nutzen
- Topologie und DRC bleiben Runtime-only

Auf `main` vorhanden sind inzwischen:

- `POST /internal/emqx/authn`
- PostgreSQL-`gateway_credentials`
- scrypt-Passwortprüfung
- trusted `client_attrs.role`
- trusted `client_attrs.gateway_sn`
- AuthZ ohne `clientid` als Gateway-Identity
- Prüfung aktiver Credential-Bindung während AuthZ
- EMQX-HTTP-AuthN-Konfiguration
- Startreihenfolge: interner Hook lauscht vor Backend-MQTT-Connect

Offen bleibt die lokale Root-Compose-/MQTT-Abnahme einschließlich
Credential-Deaktivierung und Fail-Closed-Fehlertests.

## Gate 4 – RC Pro: REAL ZU VERIFIZIEREN

Noch mit echter Hardware zu bestätigen:

- reale MQTT-Client-ID
- Username-/Credential-Semantik
- `update_topo`
- OSD/State
- Reconnect
- Pair/Unpair
- Credential-Fehler
- tatsächlich notwendige Topic-Matrix
- Capability-Matrix der eingesetzten Produkte

Die Sicherheitsarchitektur bleibt unabhängig davon, ob
`clientid == gateway_sn` beobachtet wird.

## Gate 5 – Multispektral: FACH-/CORE-VERTRAG IMPLEMENTIERT, HARDWAREABNAHME OFFEN

Auf `main` vorhanden:

- herstellerneutraler `MediaAsset`
- `SensorSource`
- `SpectralBand`
- `CaptureContext`
- Processing-Profile GENERIC/RGB/THERMAL/MULTISPECTRAL/NDVI
- M3M-Bandvertrag:
  - GREEN 560 ±16 nm
  - RED 650 ±16 nm
  - RED_EDGE 730 ±16 nm
  - NIR 860 ±26 nm
- Quellenvertrauen authoritative/derived/heuristic/unavailable
- Media-Korrelationsregeln
- NDVI_READY / NDVI_PARTIAL / NOT_NDVI_CAPABLE
- automatisierte NDVI-Regeln/Tests

Noch final abzunehmen:

- reale M3M-Mediendateien/Fixtures
- konkrete EXIF/XMP-/Media-Feldnamen
- sichere Datei->Band-Zuordnung
- ggf. exakter Cloud-`payload_index`, falls im Runtime-Pfad benötigt
- reale Ausführung der Tests nach R1

## Gate 6 – Safety: TEILWEISE IMPLEMENTIERT

Auf `main` vorhanden:

- FC0..FC3
- Control Lease
- DJI Control Authority
- DRC Session Manager
- Dead-Man
- Control Coordinator
- Transport-Recovery
- Runtime-only Autorisierungszustand
- Basic-Link-/DRC-Trennung
- AuthZ-Audit
- Basic-Link ohne permanente oder Default-DRC-Topics
- Verify-Credential-Cleanup unabhängig vom Control-API-Lifecycle

Geschlossene Robustheitsdefekte:

```text
R2 Startup-Abhängigkeit        = CLOSED
R4 Basic-Link/DRC-Regression   = CLOSED
R5 Verify-Credential-Cleanup   = CLOSED
```

Noch releasekritisch:

- vollständige lokale Safety-Abnahme
- Kill-Switch-Test
- reale Hardware-Verifikation
- Nachweis, dass Defaultbetrieb keine öffentliche Flight-Control-API öffnet

## Gate 7 – Dokumentation: WEITGEHEND ERFÜLLT

Vorhanden:

- deutsche Projektübersicht
- Doku-Index
- V3-Architektur
- DJI-MQTT-Security
- EMQX AuthN/AuthZ
- RC Pro
- DRC
- RTK/NTRIP
- Kompatibilität
- Betrieb
- Konfiguration
- Fehlersuche
- Glossar
- Release-Status
- Changelog

Die Dokumentation wird bis zum RC nur noch an tatsächlich implementierte
Runtime-/Konfigurationsänderungen angepasst.

## Gate 8 – Direktor-CI: VORBEREITET, NOCH NICHT GESTARTET

Workflow:

```text
.github/workflows/director-v3-validation.yml
```

Trigger ausschließlich:

```yaml
workflow_dispatch:
```

Die Direktor-CI prüft:

- Release-Struktur
- Root-Compose-Pflichtdienste
- `npm ci`
- Build
- Typecheck
- Tests
- UgCS-Bridge
- TimescaleDB und Migrationen
- deutsche Pflichtdokumentation

Die CI wird **erst gestartet**, wenn Gate 1 und Gate 2 lokal geschlossen sind.
Ein früher Lauf würde erwartbar an fehlendem Lockfile/Root-Compose scheitern
und wäre keine V3-Abnahme.

## Nächste zwingende Arbeit

Manager:

1. R1 schließen: echtes npm-11-`package-lock.json`
2. reproduzierbares `npm ci`
3. Build / Typecheck / Tests
4. `scripts/verify.sh` real ausführen und Ergebnis belegen
5. Gateway-Credential lokal provisionieren und AuthN prüfen
6. Credential-Deaktivierung/Fail-Closed prüfen

RC Pro:

1. reale Hardware-/MQTT-Verifikation
2. Reconnect/Pairing/Topic-Matrix

Multispektral:

1. reale M3M-Fixtures liefern
2. konkrete EXIF/XMP-/Media-Felder bestätigen
3. Datei->Band-Korrelation gegen den Core-Vertrag verifizieren

Direktor:

1. lokale Gate-Ergebnisse prüfen
2. finale CI starten
3. bei grünem Lauf `3.0.0` setzen
4. Tag/Release erstellen
5. Issues schließen
6. Projektstopp / Feierabend

## Abschlussregel

```text
Gates schließen
 -> Direktor-CI grün
 -> 3.0.0
 -> Tag/Release
 -> alle V3-Issues schließen
 -> main einfrieren
 -> Feierabend
```
