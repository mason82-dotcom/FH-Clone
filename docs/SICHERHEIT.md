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
7. Browser erhalten keine direkten MQTT- oder Flight-Control-Credentials.
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

- öffentliche Read-APIs verwenden
- RTK-SSE konsumieren
- später freigegebene Control-APIs nur über die Control API nutzen

Sie darf nicht:

- direkte MQTT-Credentials besitzen
- direkt `services` oder DRC-Topics publizieren
- Safety-/Authority-Prüfungen umgehen

## Interne Ports

Port 8081 ist Infrastruktur-intern.

Er darf nicht über einen öffentlichen Reverse Proxy oder eine öffentliche
Firewallfreigabe erreichbar sein.

## Secrets

Als geheim behandeln:

- MQTT-Passwörter
- EMQX-Interntoken
- DJI-Tokens
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
