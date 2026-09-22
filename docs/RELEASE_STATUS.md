# V3.0 Release-Status

Stand: 22.09.2026

Dieses Dokument ist die aktuelle Direktor-Sicht auf den V3-Abschluss.

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

Bewusst **nicht** gemergt:

- PR #18 – durch #21 ersetzt
- PR #19 – durch #24 ersetzt
- ältere RC-Pro-/EMQX-/Gateway-/Mission-Branches – durch ihre aktuellen
  Direktor-Integrationen ersetzt

Damit existiert derzeit kein weiterer fachlich sinnvoller Merge-Kandidat vor
dem Runtime-/Release-Gate.

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

## Gate 3 – Tests: TEILWEISE IMPLEMENTIERT

Automatisiert vorhanden sind unter anderem:

- AuthZ
- AuthZ-Reason-Taxonomie
- AuthZ-Audit-Selektion/Pufferung
- Missionssitzung
- DRC-Sitzung
- Dead-Man
- Runtime-DRC-Session-ID
- DRC-Recovery/Transportverlust

Die finale lokale Gesamtabnahme bleibt offen.

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

## Gate 5 – Multispektral: OFFEN

Noch final abzunehmen:

- Kamera-/Payload-Feldvertrag
- M3M-Bandvertrag
- Media-Korrelation
- Processing-Profile
- NDVI Ready/Partial/Not-Capable

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

1. `package-lock.json`
2. reproduzierbares `npm ci`
3. `scripts/verify.sh` real ausführen und Ergebnis belegen
4. Gateway-Credential lokal provisionieren und AuthN prüfen
5. Credential-Deaktivierung/Fail-Closed prüfen

RC Pro:

1. reale Hardware-/MQTT-Verifikation
2. Reconnect/Pairing/Topic-Matrix

Multispektral:

1. finaler Media-/Bandvertrag
2. NDVI-Regeln

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
