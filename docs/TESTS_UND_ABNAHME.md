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
apps/control-api/src/fh2-openapi.test.ts
packages/aircraft-core/src/mission.test.ts
packages/aircraft-core/src/safety.test.ts
packages/aircraft-core/src/authority.test.ts
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

### FH2 OpenAPI

`fh2-openapi.test.ts` prüft:

- Wayline-`size`-Parameter,
- Flight-Task-`page_size`,
- erforderliche FH2-Header,
- ausschließlich GET,
- Redirect-Ablehnung,
- DJI-Businesscode-Fehler.

### Core Mission/Safety/Authority

Der `aircraft-core` führt seine kompilierten `*.test.js` jetzt über das
Workspace-`test`-Script aus. Damit werden Mission-Referenzvertrag, SafetyGate
und ControlAuthority nicht mehr von Root-`npm test --workspaces --if-present`
übersprungen.

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

## Native MSDK Pairing-/Transport-Gate

Für die RC-Pro-Enterprise-App auf `agent/android-msdk-v5` wird der native
HTTPS/WSS-Pfad separat vom Pilot-2-/MQTT-Gate abgenommen.

Mit echter RC Pro Enterprise + unterstütztem M3-Aircraft prüfen:

- [ ] Pairing liefert genau eine `gatewaySn + aircraftSn`-Bindung
- [ ] Heartbeat wird nach dem Pairing etabliert
- [ ] Agent-Control-WebSocket verbindet sich mit demselben Agent-Token
- [ ] Control-API-Neustart führt zu neuem WSS, nicht zur Übernahme einer alten
      Control-Session
- [ ] App-Neustart resümiert nur bei identischer RC-/Aircraft-SN
- [ ] Identity-Mismatch bleibt fail-closed
- [ ] Unpair widerruft den Agent-Token serverseitig
- [ ] Unpair beendet eine laufende Control-Session fail-closed
- [ ] serverseitiger Unpair-Fehler löscht den lokalen Keystore-Datensatz nicht
- [ ] nach erfolgreichem Unpair erfolgt nach App-Neustart kein automatisches
      Resume ohne neues Pairing
- [ ] Hardware-Evidence enthält keine Pairing-/Bearer-/DJI-App-Secrets

Der Hardware-Nachweis erfolgt mit `fh2-msdk-evidence-<timestamp>.json`.
Zusätzlich zum unveränderten `fh2.msdk.v1`-Snapshot enthält die Datei unter
`evidence` den begrenzten, secret-freien Transport-Trace
`fh2.pairing-transport-evidence.v1`.

Der konkrete alte Bearer-Token wird für die Hardware-Abnahme nicht exportiert.
Die serverseitige Ablehnung widerrufener Tokens bleibt daher automatisiert
getestet; auf der RC wird nach Unpair nur geprüft, dass ohne neues Pairing kein
Resume mehr entsteht.


## RTK-Gate

Zu prüfen:

- [ ] GPS-only erzeugt keine RTK-Capability
- [ ] `rtk_number` wird als RTK-spezifische Telemetrie erkannt
- [ ] `quality == 10` + konsistenter Fixstatus ergibt RTK fixed
- [ ] `is_fixed == 2` allein ergibt **nicht** RTK fixed
- [ ] widersprüchliche Quality-/Fixwerte bleiben fail-closed
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

Die manuelle Direktor-CI liegt unter:

```text
.github/workflows/director-v3-validation.yml
```

Sie wird ausschließlich über `workflow_dispatch` gestartet.

Das Vorhandensein des Workflows ist noch kein bestandener CI-Nachweis. Der
Direktor startet ihn erst nach belegten lokalen V3-Gates.

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

## Mission/Wayline/Capabilities

Vor V3-RC lokal prüfen:

- [ ] `mode_code == 5` setzt `lastActivity=wayline` und `waylineObserved=true`.
- [ ] Wechsel aus Wayline in einen anderen aktiven Modus erhält `waylineObserved=true`.
- [ ] Standby-Grace meldet nicht fälschlich `currentlyFlyingWayline=true`.
- [ ] `/api/devices/{device_sn}/wayline` erfindet keine Wayline-ID.
- [ ] `/api/devices/{device_sn}/capabilities` trennt Adapter-Capabilities und DJI-Control-Profil.
- [ ] DJI-Produktsupport erzeugt ohne `AircraftAdapter.execute()`-Pfad keine generische Schreib-Capability.
- [ ] `mission.wayline` bleibt für den DJI-Cloud-Adapter in V3 nicht beworben.
- [ ] Wayline-Beobachtung aktiviert weder FC2 noch Mission Execution.

Verbindliche Invariante:

```text
Wayline beobachtet
  !=
Wayline Management implementiert
  !=
mission.wayline ausführbar
```
