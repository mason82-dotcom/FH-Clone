# Betrieb und lokale Entwicklung

## Status

Dieses Dokument beschreibt den aktuellen lokalen Entwicklungsbetrieb und den
verbindlichen V3-Zielbetrieb.

Der finale Root-Compose-Gesamtstack ist noch ein offenes Release-Gate. Daher
werden hier keine noch nicht existierenden Startbefehle als bereits
funktionierend dargestellt.

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

## Lokale Node.js-Prüfung

```bash
npm install
npm run build
npm run typecheck
npm test
```

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
EMQX_AUTHZ_TOKEN=...
```

### Missionspersistenz

```env
TIMESCALE_URL=postgresql://...
RTK_SOURCE_LABEL=...
RTK_SOURCE_PROVIDER=...
```

Ohne `TIMESCALE_URL` läuft die automatische Missionssitzung weiterhin
In-Memory.

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

Der finale Stack muss mindestens enthalten:

```text
control-api
emqx
web
timescaledb
```

UgCS bleibt optional.

Das V3-Release-Gate verlangt:

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
