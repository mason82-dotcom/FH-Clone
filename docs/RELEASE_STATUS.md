# V3.0 Release-Status

Stand: 22.09.2026

Dieses Dokument unterstützt den Releases-Agenten bei der V3.0-Konvergenz.
Es ersetzt keine Direktor-Freigabe und startet keine CI.

## Versionsstatus

Aktuell:

```text
package.json = 0.1.0
V3.0       = noch nicht freigegeben
```

Die Version `3.0.0` wird erst gesetzt, wenn alle Release-Gates bestanden
sind. Es gibt aktuell keinen `VERSION`-Marker und keinen Release-Tag.

## Gate-Übersicht

### Gate 1 – Build: TEILWEISE OFFEN

Vorhanden:

- Root-Workspace
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:authz`

Noch als Release-Nachweis erforderlich:

- reproduzierbare lokale Ausführung aller Build-Schritte
- Web-Build
- optionaler UgCS-Bridge-Build

### Gate 2 – Runtime: OFFEN

Im Repository fehlt aktuell der finale Root-Stack für:

```text
control-api
emqx
web
timescaledb
```

Ebenfalls noch nicht vorhanden:

- Root-`.env.example`
- Root-Verify-Skript
- gemeinsamer Health-/Readiness-Abnahmepfad

TimescaleDB besitzt bereits einen separaten Unterstack, ist aber noch nicht in
einen finalen Root-Compose integriert.

### Gate 3 – Tests: TEILWEISE OFFEN

Automatisierte Tests existieren unter anderem für:

- AuthZ
- Missionssitzung
- DRC-Sitzung / Recovery

Die verbindliche Restliste steht in
`docs/TESTS_UND_ABNAHME.md`.

### Gate 4 – RC Pro: OFFEN / REAL ZU VERIFIZIEREN

Noch mit echter Hardware nachzuweisen:

- MQTT-Identität
- `update_topo`
- OSD/State
- Reconnect
- Pair/Unpair
- Credential-Fehler
- tatsächlich benötigte Topic-Matrix

### Gate 5 – Multispektral: OFFEN

Noch nicht final abgenommen:

- Kamera-/Payload-Feldvertrag
- M3M-Bandvertrag
- Media-Korrelation
- NDVI Ready/Partial/Not-Capable

### Gate 6 – Safety: TEILWEISE IMPLEMENTIERT, ABNAHME OFFEN

Auf `main` vorhanden:

- FC0..FC3
- Control Lease
- DJI Authority
- DRC Session Manager
- Dead-Man
- Control Coordinator
- Recovery-Logik

Noch releasekritisch:

- vollständige lokale Safety-Abnahme
- Kill-Switch-Test
- Nachweis, dass Defaultbetrieb keine öffentliche DRC-/Flight-Control-API
  freigibt
- reale Hardware-Verifikation

### Gate 7 – Direktor-CI: OFFEN

Im Repository existiert derzeit kein Workflow unter:

```text
.github/workflows/
```

Das ist korrekt als noch offenes Gate dokumentiert.

Nur der Direktor darf die zentrale CI einrichten, starten und bewerten.

## Offene Pull Requests

### PR #18 – DJI Control Coordinator V3

Status:

```text
open
divergiert
22 Commits hinter aktuellem main
9 Commits eigener Verlauf gegenüber seinem alten Stand
```

Der aktuelle `main` enthält bereits einen Commit
`DJI DRC Control Integration V3`. PR #18 darf deshalb nicht blind gemerged
werden. Der Releases-Agent soll nur noch prüfen, ob dort einzelne Änderungen
fehlen, und den PR danach schließen oder gezielt portieren.

### PR #19 – AuthZ Reason + Audit

Status:

```text
open
divergiert
1 Commit hinter main
1 Commit vor main
```

PR #19 ist ein echter Release-Gate-Kandidat für:

- stabile AuthZ-Reason-Taxonomie
- Runtime-only DRC-/Topology-Autorität
- gepuffertes Audit
- TimescaleDB-`authz_audit`
- Shutdown-Flush

Empfehlung: auf aktuellen `main` portieren/rebasen und separat prüfen.

## Dokumentations-Gate

`docs/README.md` ist vorhanden und listet die verbindlichen V3-Dokumente.

Aktuell existieren jedoch zwei RC-Pro-Dokumente:

```text
docs/RC_PRO.md      verbindliche ausführliche Fassung
docs/RC-PRO.md      historischer Doppelstand
```

Der Doppelstand wird im Release-Support-Branch auf einen eindeutigen
Verweis reduziert, damit keine widersprüchliche zweite Quelle verbleibt.

## Release-Artefakte

Vor dem RC sinnvoll:

- `CHANGELOG.md` mit Abschnitt `Unreleased`
- finaler Root-Compose
- Root-`.env.example`
- lokaler Release-/Verify-Check
- danach erst `3.0.0`

Noch nicht setzen:

- kein `v3.0.0`-Tag
- kein `package.json = 3.0.0`
- kein finaler Release-Eintrag

## Release-Reihenfolge

```text
PR #19 auf aktuellen main bringen
        |
        v
Gate 1 Build lokal
        |
        v
Gate 2 Root Runtime
        |
        v
Gate 3 Tests
        |
        v
Gate 4 RC-Pro Hardware
        |
        v
Gate 5 Multispektral
        |
        v
Gate 6 Safety
        |
        v
Doku-Gate
        |
        v
Direktor-CI
        |
        v
3.0.0 setzen + Tag + Release
```
