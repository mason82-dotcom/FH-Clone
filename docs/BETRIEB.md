# Betrieb und lokale Entwicklung

## Status

Dieses Dokument beschreibt den aktuellen lokalen Entwicklungsbetrieb und den
verbindlichen V3-Zielbetrieb.

Der Root-Compose-Gesamtstack ist auf `main` vorhanden. Seine lokale
Ausführung und Abnahme ist weiterhin ein Release-Gate; die Dokumentation
unterscheidet deshalb zwischen **implementiert** und **lokal verifiziert**.

## Voraussetzungen

Für die Node.js-Workspaces:

```text
Node.js >= 22
npm 11
```

Für die optionale UgCS-Bridge zusätzlich:

```text
Java 17
Maven
```

Für den V3-Gesamtstack werden Docker und Docker Compose sowie TimescaleDB/PostgreSQL benötigt.

## TimescaleDB-Unterstack

Der Datenbankteil kann bereits separat reproduzierbar gestartet werden:

```bash
cd infra/timescale
cp .env.example .env
# TIMESCALE_PASSWORD in .env durch ein sicheres Passwort ersetzen
docker compose --env-file .env up -d
docker compose ps
```

Der Datenbankport wird nicht standardmäßig auf den Host veröffentlicht.

Der separate Unterstack bleibt für Datenbankdiagnose nutzbar. Für die
V3-Gesamtabnahme wird jedoch der Root-Compose im Repository-Wurzelverzeichnis
verwendet.

## V3-Gesamtstack lokal starten

```bash
cp .env.example .env
```

Danach **alle** `change-me-...`-Werte in `.env` durch eigene starke Secrets
ersetzen.

Gesamtabnahme:

```bash
sh scripts/verify.sh
```

Das Verify-Skript:

- validiert den Root-Compose,
- baut Control API und Web,
- startet `control-api`, `emqx`, `web` und `timescaledb`,
- prüft `/health` und `/ready`,
- prüft den Web-Proxy,
- stellt sicher, dass Port 8081 nicht am Host veröffentlicht ist,
- prüft AuthN mit ungültigem Token auf `HTTP 200 + deny`,
- startet TimescaleDB neu und wartet erneut auf Readiness.

Der Stack bleibt nach erfolgreicher Prüfung gestartet.

### Gateway-Credential provisionieren

Für reale RC-Pro-/RC-Plus-Tests steht ein lokales Provisioning-Skript bereit:

```bash
bash scripts/provision-gateway.sh dji-gateway-rcpro1 RC-PRO-001
```

Das Passwort wird interaktiv verdeckt abgefragt, mit scrypt gehasht und nur
als Hash in `gateway_credentials` gespeichert. Ein vorhandener Username wird
damit rotiert und wieder aktiviert.

Das Skript gibt weder Passwort noch Hash aus.

### Was der Verify zusätzlich prüft

Neben Health/Readiness validiert `scripts/verify.sh` auch:

- ungültiger AuthN-Service-Token -> `HTTP 200 + deny`
- temporäres Gateway-Credential -> AuthN `allow`
- trusted `client_attrs.gateway_sn`
- AuthZ eines eigenen Gateway-Status-Topics
- deaktiviertes Credential -> sofortiges AuthZ `deny`
- keine permanenten `drc/up`-/`drc/down`-Rechte in der Datei-ACL
- Datenbankmarker bleibt über TimescaleDB-Restart erhalten

## Lokale Node.js-Prüfung

Solange das Root-`package-lock.json` noch fehlt:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Für den Release Candidate ist `npm ci` mit committed Lockfile verbindlich.

Zusätzlicher AuthZ-Testpfad:

```bash
npm run test:authz
```

## Control API

Die Control API besitzt zwei Ports:

```text
8080 öffentlich
8081 intern
```

Der interne Port darf nicht über einen öffentlichen Reverse Proxy
veröffentlicht werden.

### Minimale DJI-Umgebung

```env
DJI_MQTT_URL=mqtt://...
DJI_MQTT_USERNAME=...
DJI_MQTT_PASSWORD=...
DJI_MQTT_CLIENT_ID=...
DJI_CLOUD_API_VERSION=1.16.1
```

### Interner EMQX-Zugriff

```env
EMQX_AUTHN_TOKEN=...
EMQX_AUTHZ_TOKEN=...
```

Der Root-Compose reicht beide Werte zusätzlich als EMQX-Konfigurations-
Overrides an die HTTP-AuthN/AuthZ-Header weiter.

### Missionspersistenz

```env
TIMESCALE_URL=postgresql://...
RTK_SOURCE_LABEL=...
RTK_SOURCE_PROVIDER=...
```

Ohne `TIMESCALE_URL` läuft die automatische Missionssitzung weiterhin
In-Memory. Mit Datenbankverbindung werden Missionsstart und -ende gespeichert.
Beim Dienstneustart werden noch offene automatische Missionen mit
`service_restart` abgeschlossen, bevor neuer DJI-Ingest beginnt.

Secrets niemals committen.

## Health

Öffentlich:

```http
GET /health
```

Intern:

```http
GET /health
```

auf dem internen Control-API-Port.

## V3-Gesamtstack

Der Root-Compose enthält:

```text
control-api
emqx
web
timescaledb
```

UgCS bleibt optional.

Netztrennung:

- `frontend`: Web + Control API
- `backend`: Control API + EMQX + TimescaleDB, Docker-intern
- `mqtt_edge`: EMQX für den veröffentlichten MQTT-Listener

Port 8081 wird nur über `expose` im Docker-Netz bekannt gemacht und nicht als
Host-Port veröffentlicht.

Das noch offene lokale V3-Abnahme-Gate verlangt:

- reproduzierbaren Start
- Health/Readiness aller Pflichtdienste
- Neustart ohne Datenverlust
- keine öffentlich exponierten internen Broker-APIs
- persistente Datenbankmigrationen
- lokale Verify-Suite

## Netzwerkgrenzen

Öffentlich/LAN:

- Weboberfläche
- öffentliche Control API

Intern:

- EMQX AuthN/AuthZ
- Datenbank
- interne Servicekommunikation

DRC verwendet eine eigene, sitzungsgebundene Sicherheitsdomäne.

## Logs

Logs dürfen enthalten:

- Dienststatus
- Device-/Gateway-ID
- Topic
- Aktion
- Fehlercode
- Correlation-ID

Logs dürfen nicht enthalten:

- Passwörter
- Tokens
- NTRIP-Credentials
- DRC-Relay-Passwörter
- vollständige private Secrets

## Fehlerdiagnose

### DJI MQTT verbindet nicht

Prüfen:

1. Broker-URL
2. DNS/IP
3. Port
4. Username/Passwort
5. EMQX AuthN/AuthZ
6. Client-ID-Konflikt
7. TLS-Konfiguration
8. Broker-Logs

### Gateway verbunden, Aircraft fehlt

Prüfen:

1. `sys/product/{gateway_sn}/status`
2. `update_topo`
3. Sub-Device-SN
4. TopologyRegistry
5. AuthZ auf Aircraft-`osd/state`

### RTK fehlt

Prüfen:

1. Aircraft-Telemetrie
2. RTK-Hardware/Capability
3. DJI-Felder in OSD/State
4. Parser
5. Stale-Status

### WebUI ohne Daten

Prüfen:

1. Control API erreichbar
2. API-Proxy im Entwicklungsbetrieb
3. RTK-Endpunkte
4. SSE-Verbindung
5. Browser-Konsole

## Abschlussbetrieb

Nach der finalen V3-Abnahme bleibt `main` als freigegebener Abschlussstand
bestehen. Es gibt keine Folgeentwicklung ohne neuen Auftrag.


## Readiness-Semantik

`GET /health` zeigt, ob der HTTP-Prozess läuft. `GET /ready` prüft die
konfigurierten Runtime-Abhängigkeiten.

Für jede Abhängigkeit gilt:

- `disabled`: nicht konfiguriert; blockiert die Readiness nicht
- `ready`: konfiguriert und erreichbar
- `unavailable`: konfiguriert, aber nicht erreichbar/bereit; HTTP 503

Damit wird ein bewusst ohne DJI-MQTT oder Persistenz gestarteter
Entwicklungsprozess nicht mit einem ausgefallenen Produktionsdienst
verwechselt. Im Root-Compose sind EMQX und TimescaleDB konfiguriert; dort
bleiben sie zwingende Readiness-Voraussetzungen.


## Shutdown-Verhalten

SIGINT und SIGTERM führen einen idempotenten Shutdown aus.

Dabei werden nacheinander beziehungsweise kontrolliert bereinigt:

- öffentliche und interne HTTP-Server
- aktive DRC-Sitzungen
- DJI-MQTT-/DRC-Transport
- UgCS-Adapter
- AuthZ-Audit
- Gateway-Credential-Store
- Mission-Persistenz
- Topologie-Persistenzqueue
- Topologie-Store

Ein Fehler in einem Cleanup-Schritt verhindert die übrigen Cleanup-Schritte
nicht. Nach Abschluss wird der Gesamtfehler jedoch als fehlerhafter
Prozess-Shutdown sichtbar; ein teilweise fehlgeschlagener Shutdown wird nicht
mehr mit Exitcode 0 kaschiert.
