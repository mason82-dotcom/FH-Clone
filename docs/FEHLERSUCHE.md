# Fehlersuche

## Grundsatz

Fehler werden schichtweise eingegrenzt:

```text
Weboberfläche
 -> Control API
 -> Aircraft Core
 -> DJI-Adapter
 -> EMQX
 -> DJI Gateway / Aircraft
```

Sicherheitsregeln dürfen nicht gelockert werden, nur um einen Fehler zu
umgehen.

## Control API nicht erreichbar

Prüfen:

1. läuft der Prozess?
2. stimmt `PORT`?
3. stimmt `BIND`?
4. antwortet `GET /health`?
5. ist Port 8080 bereits belegt?

Beispiel:

```bash
curl -v http://127.0.0.1:8080/health
```

## Interne EMQX-API nicht erreichbar

Prüfen:

1. `INTERNAL_PORT`
2. `INTERNAL_BIND`
3. Netzwerk zwischen EMQX und Control API
4. `EMQX_AUTHZ_TOKEN`
5. interner Port 8081 nicht versehentlich öffentlich veröffentlicht

Die interne API ist ausschließlich für Infrastrukturkommunikation vorgesehen.

## DJI-Adapter bleibt deaktiviert

Wenn `DJI_MQTT_URL` nicht gesetzt ist, startet der DJI-Adapter absichtlich
nicht.

Prüfen:

```text
DJI_MQTT_URL
DJI_MQTT_USERNAME
DJI_MQTT_PASSWORD
DJI_MQTT_CLIENT_ID
```

## DJI-MQTT verbindet nicht

Prüfen:

1. Broker-URL
2. DNS/IP
3. Port
4. Username
5. Passwort
6. TLS-Schema
7. EMQX-Authentifizierung
8. Broker-Logs
9. Client-ID-Konflikt

Nicht als Fehlerbehebung zulässig:

- Anonymous-Zugriff aktivieren
- globale `#`-ACL
- Default-Deny entfernen

## Gateway verbunden, Aircraft-Telemetrie fehlt

Prüfen:

1. kommt `sys/product/{gateway_sn}/status`?
2. enthält die Nachricht `method = update_topo`?
3. ist das Aircraft als Sub-Device registriert?
4. kommen `thing/product/{device_sn}/osd` oder `state`?
5. erlaubt AuthZ genau diese `device_sn`?
6. stimmt die Topic-Richtung?

Wichtig:

```text
gateway_sn != device_sn
```

## AuthZ verweigert berechtigte Topics

Prüfen:

1. Username/Principal
2. bekannte Gateway-SN
3. aktuelle TopologyRegistry
4. Topic
5. Aktion `publish` oder `subscribe`
6. QoS
7. `EMQX_AUTHZ_TOKEN`
8. Pair-/Unpair-Zustand

Die MQTT-Client-ID darf nicht als alleinige Sicherheitsidentität verwendet
werden.

## AuthZ erlaubt zu viel

Sofort prüfen:

- `authorization.no_match = deny`
- abschließendes `{deny, all}.`
- keine globalen Produkt-Wildcards
- DRC nicht in permanenter Basic-Link-ACL
- Sub-Device-Rechte nur über aktuelle Topologie
- Cache-TTL nicht zu lang

Bei Unsicherheit gilt: verweigern.

## DRC funktioniert nicht

Im Standardzustand ist das beabsichtigt.

DRC benötigt vollständig:

```text
FC3
+ Control Lease
+ passende Produkt-Capability
+ DJI Control Authority
+ drc_mode_enter
+ DRC Relay
+ Dead-Man
```

Nicht zum Testen global FC3 oder Brokerrechte freischalten.

## RTK-Werte fehlen

Prüfen:

1. Aircraft sendet OSD/State
2. RTK-Funktion beziehungsweise Hardware vorhanden
3. Payload enthält RTK-Felder
4. richtige `device_sn`
5. Snapshot nicht nur veraltet
6. Normalizer erkennt die Payload-Struktur

## RTK-Fix wird falsch dargestellt

`position_state.is_fixed` ist kein Boolean.

FH2 interpretiert:

```text
0 = nicht gestartet
1 = Fix läuft
2 = Fix erfolgreich
3 = Fix fehlgeschlagen
```

Nur `2` ist ein erfolgreicher RTK-Fix.

## Weboberfläche zeigt keine Daten

Prüfen:

1. Control API auf Port 8080
2. Vite-Proxy
3. `GET /api/rtk`
4. `GET /api/events/rtk`
5. Browser-Konsole
6. Netzwerk-/Proxykonfiguration

Die Weboberfläche benötigt keine direkten MQTT-Credentials.

## Mission wird nicht erkannt

Prüfen:

1. relevante DJI-Rohmeldungen vorhanden
2. `MissionSessionTracker` erhält die Nachricht
3. `device_sn` korrekt
4. aktiver Missionszustand nicht bereits beendet
5. `GET /api/missions/active`
6. `GET /api/devices/{device_sn}/mission`

## UgCS-Bridge verbindet nicht

Prüfen:

1. `UGCS_HOST`
2. `UGCS_PORT`
3. UCS erreichbar
4. Username/Passwort
5. Java-Version
6. Firewall
7. eingesetzte UgCS-/UCS-Version

## Build schlägt fehl

Versionen prüfen:

```bash
node --version
npm --version
```

Erwartet:

```text
Node.js >= 22
npm 11
```

Danach:

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Sicherheitsrelevante Diagnose

Nie in Logs, Screenshots oder Tickets übernehmen:

- MQTT-Passwörter
- DJI-Tokens
- EMQX-Interntoken
- DRC-Credentials
- UgCS-Passwort
- NTRIP-Zugangsdaten

Secrets vor dem Teilen konsequent entfernen.
