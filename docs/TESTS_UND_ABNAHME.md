# Tests und V3-Abnahme

## Zweck

Dieses Dokument beschreibt den tatsächlichen Teststand auf `main` und die
verbindlichen V3-Abnahmeschritte.

Es unterscheidet:

- bereits vorhandene automatisierte Tests
- lokale Integrationsprüfungen
- reale Hardwaretests
- finale Direktor-CI

## Aktuell vorhandene automatisierte Tests

Im Repository vorhanden:

```text
apps/control-api/src/authz.test.ts
apps/control-api/src/mission-session.test.ts
packages/adapters/dji-cloud/src/drc-session.test.ts
```

### AuthZ

`authz.test.ts` prüft die EMQX-/DJI-Autorisierungslogik.

Schwerpunkt:

- Gateway-/Topic-Regeln
- Default-Deny
- dynamische Topologie
- erlaubte und verweigerte Aktionen

### Missionssitzung

`mission-session.test.ts` prüft die Erkennung und Verwaltung aktiver
Missionssitzungen.

### DRC-Sitzung

`drc-session.test.ts` prüft die serverseitige DRC-Sitzungslogik einschließlich
Dead-Man-/Sitzungszuständen.

## Lokale Standardprüfung

Aus dem Repository-Root:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Zusätzlich:

```bash
npm run test:authz
```

Ein fehlgeschlagener Schritt blockiert die V3-Abnahme.

## Noch fehlende automatisierte Tests für V3

Vor dem Release Candidate müssen mindestens ergänzt oder nachweislich
abgedeckt sein:

- SafetyGate
- ControlAuthority
- DjiTopologyRegistry
- DJI-Normalizer
- Service-/Reply-Korrelation
- EMQX AuthN
- Gateway-Credential-Bindung
- AuthZ mit trusted `gateway_sn`
- Basic Link ohne permanente DRC-Rechte
- Credential-Deaktivierung
- Pair/Unpair-Rechteentzug
- RTK-Fix-Interpretation
- RTK-Fix-Verlust
- Media-/NDVI-Validierung
- Persistenz-/Restart-Verhalten
- offene automatische Mission wird bei Service-Neustart mit `service_restart` abgeschlossen
- TimescaleDB-Schema und Initialisierung sind idempotent

## Build-Gate

Erforderlich:

- [ ] `npm install` reproduzierbar
- [ ] `npm run build` erfolgreich
- [ ] `npm run typecheck` erfolgreich
- [ ] `npm test` erfolgreich
- [ ] Web-Build erfolgreich
- [ ] optionale UgCS-Bridge separat baubar

## Runtime-Gate

Der finale Root-Compose muss gemeinsam starten:

```text
control-api
emqx
web
timescaledb
```

Zu prüfen:

- [ ] Health aller Pflichtdienste
- [ ] Readiness
- [ ] Neustart ohne Verlust persistenter Daten
- [ ] offene automatische Missionszeilen werden beim Neustart sicher abgeschlossen, nicht still als aktive Sitzung rehydriert
- [ ] interner Port 8081 nicht öffentlich
- [ ] WebUI ohne MQTT-Credentials
- [ ] Standard-Safety-Stufe FC0

## MQTT-Sicherheits-Gate

Zu prüfen:

- [ ] unbekannter Principal -> deny
- [ ] falsches Passwort -> deny
- [ ] deaktivierter Principal -> deny
- [ ] fehlende `gateway_sn`-Bindung -> deny
- [ ] fremdes Gateway-Topic -> deny
- [ ] fremdes Aircraft-Topic -> deny
- [ ] gültiges Sub-Device aus aktueller Topologie -> nur bestätigte Rechte
- [ ] entferntes Sub-Device verliert Rechte
- [ ] Basic Link enthält keine permanenten DRC-Rechte
- [ ] Ausfall des dynamischen Auth-Backends führt nicht zu breiter Freigabe

## RC-Pro-Hardware-Gate

Mit echter Hardware bestätigen:

- [ ] Broker-Verbindung
- [ ] reale MQTT-Client-ID
- [ ] reale Username-/Credential-Semantik
- [ ] `update_topo`
- [ ] Aircraft OSD/State
- [ ] Reconnect
- [ ] Controller-Neustart
- [ ] Pilot-2-Neustart
- [ ] Pair/Unpair
- [ ] Credential-Fehler
- [ ] tatsächlich notwendige Topic-Matrix

Die Beobachtung `clientid == gateway_sn` darf die V3-Security nicht auf diese
Annahme reduzieren.

## RTK-Gate

Zu prüfen:

- [ ] `is_fixed == 2` wird als Fix erkannt
- [ ] andere Enum-Werte werden nicht als Fix behandelt
- [ ] Fix-Wechsel korrekt
- [ ] Stale-Status korrekt
- [ ] Reconnect
- [ ] Missionskontext
- [ ] keine NTRIP-Secrets in API/Logs/Persistenz

## Multispektral-/Media-Gate

Zu prüfen:

- [ ] Sensorquelle eindeutig
- [ ] Payload-Zuordnung eindeutig
- [ ] Red-Band authoritative identifiziert
- [ ] NIR-Band authoritative identifiziert
- [ ] `NDVI_READY` nur bei vollständigem Vertrag
- [ ] `NDVI_PARTIAL` bei unvollständigem Datensatz
- [ ] widersprüchliche Metadaten erzeugen keinen stillen Erfolg
- [ ] heuristische Zuordnung bleibt als heuristisch gekennzeichnet

## Safety-Gate

Zu prüfen:

- [ ] Default FC0
- [ ] kein öffentlicher Flight-Control-Endpunkt im Defaultbetrieb
- [ ] Control Lease erforderlich
- [ ] DJI Control Authority separat erforderlich
- [ ] DRC-Sitzung separat erforderlich
- [ ] Dead-Man
- [ ] neutraler/geschlossener Zustand nach Sitzungsende
- [ ] Kill Switch

## GitHub-CI

Im FH-Clone-Repository existiert derzeit **noch kein Workflow unter
`.github/workflows/`**.

Das ist kein bestandener CI-Nachweis.

Die zentrale CI wird erst vom Direktor eingerichtet beziehungsweise gestartet,
wenn die lokalen V3-Gates erfüllt sind.

## Freigabe

Die Reihenfolge ist verbindlich:

```text
Build
 -> lokale Tests
 -> Runtime
 -> Security
 -> RC-Pro-Hardware
 -> Multispektral
 -> Safety
 -> Dokumentationsprüfung
 -> TimescaleDB-/Restart-Abnahme
 -> Direktor-CI
 -> V3.0 Release
```

Nach erfolgreicher V3.0-Freigabe werden die V3-Arbeitspakete geschlossen und
das Projekt gestoppt.
