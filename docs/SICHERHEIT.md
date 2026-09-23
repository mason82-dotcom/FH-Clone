# Sicherheitsmodell

## Zweck

Dieses Dokument fasst die sicherheitsrelevanten Regeln von FH2 V3 an einer
Stelle zusammen.

Es ersetzt nicht die Detaildokumente für MQTT, EMQX und DRC, sondern beschreibt
die übergreifenden Schutzschichten.

## Grundprinzipien

1. Standardzustand ist FC0.
2. Lesen und Schreiben sind getrennte Vertrauensbereiche.
3. Capability bedeutet nicht automatisch Freigabe.
4. Control Lease, SafetyGate und DJI Authority sind getrennte Ebenen.
5. MQTT-Client-ID ist keine Sicherheitsidentität.
6. DRC ist keine dauerhafte Basic-Link-Berechtigung.
7. Browser erhalten keine direkten MQTT- oder FH-Clone-DRC-Credentials.
8. Fehler in dynamischer Autorisierung müssen fail-closed enden.
9. Secrets werden weder geloggt noch in öffentliche API-Antworten geschrieben.
10. Unbekannte oder nicht verifizierte Gerätepfade bleiben gesperrt.

## Safety-Stufen

| Stufe | Bedeutung | Beispiele |
| --- | --- | --- |
| FC0 | lesen, analysieren, planen | Telemetrie, RTK, Topologie |
| FC1 | kontrollierte nicht flugkritische Schreibzugriffe | Kamera/Gimbal/Payload |
| FC2 | Missions-/Task-Steuerung | Wayline/Mission |
| FC3 | Flugsteuerung | RTH, DRC, Pointing, Orbit |

Die Beispiele in dieser Tabelle sind Risikoklassen für mögliche Commands.
Sie sind keine Aussage, dass der aktuelle DJI-Adapter diese Funktionen bereits
ausführen oder als Capability melden kann.

Der aktuelle Core startet auf FC0.

## Command-Pipeline

Ein Command darf nur weitergeleitet werden, wenn alle relevanten Prüfungen
erfolgreich sind.

```text
Command
  -> SafetyGate
  -> Control Lease
  -> CapabilityRouter
  -> Adapter
  -> ggf. DJI Authority
  -> ggf. DRC Session
```

## Control Lease

Ein `ControlLease` bindet:

```text
deviceId
adapterId
owner
expiresAt
```

Eigenschaften:

- zeitlich begrenzt
- pro Gerät eindeutig
- anderer Owner kann aktive Lease nicht übernehmen
- abgelaufene Lease wird verworfen

## Kill Switch

Das `SafetyGate` besitzt einen globalen Kill Switch.

Ist er aktiv, werden Commands blockiert, unabhängig von der sonstigen
Safety-Stufe.

Vor V3-Freigabe muss dieses Verhalten automatisiert getestet sein.

## MQTT-Sicherheitsidentität

Nicht zulässig:

```text
clientid -> gateway_sn
```

als alleinige Vertrauensableitung.

V3-Ziel:

```text
Credential
 -> Principal
 -> HTTP AuthN
 -> trusted gateway_sn
 -> HTTP AuthZ
 -> TopologyRegistry
```

## EMQX

Verbindlich:

- Default-Deny
- statische Fallback-ACL
- dynamische Gateway-Autorisierung
- interner AuthZ-Endpunkt nicht öffentlich
- V3: zusätzlicher AuthN-Endpunkt
- DRC nicht dauerhaft in Basic-Link-ACL

## DRC

DRC benötigt:

```text
FC3
+ Control Lease
+ Produkt-Capability
+ DJI Control Authority
+ drc_mode_enter
+ DRC Relay
+ Dead-Man
```

DRC-Sitzung und Basic Link sind getrennte Sicherheitsdomänen.

## Weboberfläche

Die Weboberfläche darf:

- öffentliche FH-Clone-APIs verwenden
- RTK-SSE konsumieren
- freigegebene FH-Clone-Control-APIs nur über die Control API nutzen
- die offizielle FlightHub-2-On-Premises-Frontend-Runtime direkt über
  `window.FH2` verwenden

Die `window.FH2`-Ausnahme gilt ausschließlich für die offiziellen
Standalone-Komponenten. Sie darf nicht auf MQTT oder den FH-Clone-DRC-Pfad
ausgeweitet werden.

Die Weboberfläche darf nicht:

- direkte MQTT-Credentials besitzen
- direkt `services` oder FH-Clone-DRC-Topics publizieren
- Safety-/Authority-Prüfungen des FH-Clone-Control-Pfads umgehen

Das offizielle DJI Virtual Cockpit ist ein separater nativer
FlightHub-2-Control-Pfad. Es ist standardmäßig deaktiviert und muss bewusst
über `VITE_FH2_NATIVE_COCKPIT_ENABLED=true` aktiviert werden.

## Interne Ports

Port 8081 ist Infrastruktur-intern.

Er darf nicht über einen öffentlichen Reverse Proxy oder eine öffentliche
Firewallfreigabe erreichbar sein.

## Secrets

Als geheim behandeln:

- MQTT-Passwörter
- EMQX-Interntoken
- serverseitige DJI-/OpenAPI-Tokens
- DRC-Relay-Credentials
- UgCS-Passwort
- NTRIP-Credentials
- Datenbankpasswörter

## Audit

Sicherheitsrelevante Entscheidungen sollen mindestens erfassen:

- Zeitpunkt
- Principal
- Gateway-/Device-ID
- Aktion
- Topic beziehungsweise Command
- Entscheidung
- Grund
- Correlation-ID

Keine Secrets protokollieren.

Der browserseitige `VITE_FH2_PROJECT_TOKEN` der offiziellen Standalone-
Runtime ist technisch im Frontend sichtbar und deshalb **kein geeigneter Ort
für serverseitige Geheimnisse**. Insbesondere darf `FH2_USER_TOKEN` niemals
als `VITE_FH2_PROJECT_TOKEN` wiederverwendet werden.

## Trust Boundaries

### Öffentlich/LAN

- WebUI
- öffentliche Control API

### Intern

- EMQX AuthN/AuthZ
- PostgreSQL
- interne Control-API
- optionale Service-zu-Service-Kommunikation

### Extern

- DJI Pilot 2 / Controller
- DJI Cloud-Protokolle
- UgCS/UCS

Jede Grenze benötigt explizite Authentifizierung und Autorisierung.

## V3-Abnahme

Pflichtprüfungen:

- Default FC0
- Kill Switch
- abgelaufene Control Lease
- falscher Lease-Owner
- fehlende Capability
- unbekannter MQTT-Principal
- falsches Passwort
- fremdes Gateway-Topic
- fremdes Aircraft-Topic
- Basic Link ohne DRC-Rechte
- DRC ohne aktive Session verweigert
- Auth-Backend-Fehler fail-closed
- keine Secrets in API/Logs


## Pilot 2 JSBridge

`window.djiBridge` ist eine separate Pilot-2-WebView-Sicherheitsdomäne und
wird nicht mit `window.FH2`, MQTT-AuthN/AuthZ oder dem MSDK-Controlpfad
gleichgesetzt.

Der integrierte Browserpfad ist read-only. Er darf keine Gateway-/MQTT-,
API-/WS-, EMQX-, DRC- oder Backend-Secrets erhalten oder auslesen.
Insbesondere sind License-/App-Key-, Token- und Passwortwerte als
`VITE_*`-Buildvariablen für diesen Pfad unzulässig.

Eine verifizierte Pilot-2-Identität dient ausschließlich der UI-Kontextwahl,
wenn RC- und Aircraft-SN gemeinsam exakt mit der bekannten FH2-Topologie
übereinstimmen. Daraus entstehen keine Safety- oder Control-Rechte.

Der CI-Guard `scripts/verify-pilot2-jsbridge.mjs` erzwingt diese Grenze.
