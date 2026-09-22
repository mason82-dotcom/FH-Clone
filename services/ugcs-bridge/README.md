# FH2-UgCS-UCS-Bridge

## Aufgabe

Die Java-Bridge verbindet FH-Clone mit dem UgCS Universal Control Server
(UCS).

Der aktuelle Schwerpunkt ist **lesen zuerst**.

## Verifizierte Basis

Aktuell dokumentierter Referenzstand im Projekt:

- UgCS Java SDK 5.17.1
- HCI-Protokoll v2.0 laut zugehörigem Release
- UCS-Standardport für Desktop-Clients: TCP 3334
- Java-17-kompatibler Bridge-Code

Vor einem V3-Release ist die eingesetzte lokale UgCS-Version gegen diesen
Referenzstand zu prüfen.

## Aktuelle HTTP-Endpunkte

Nur lesend:

```http
GET /health
GET /vehicles
GET /routes
GET /telemetry
```

Schreibende UgCS-Befehle werden nicht direkt von der Bridge für die
Weboberfläche freigegeben.

## Umgebungsvariablen

- `UGCS_HOST` – Standard `localhost`
- `UGCS_PORT` – Standard `3334`
- `UGCS_USER`
- `UGCS_PASSWORD`
- `BRIDGE_BIND` – Standard `0.0.0.0`
- `BRIDGE_PORT` – Standard `8092`

Zugangsdaten gehören in Runtime-Secrets.

## Build

```bash
mvn -B -DskipTests package
```

## V3-Sicherheitsgrenze

- Lesen/Planung: FC0
- Mission Execution: frühestens FC2
- Aircraft-Control außerhalb einer Mission: eigene Capability/Safety-Prüfung

Die Bridge darf den zentralen FH2-Command- und Safety-Pfad nicht umgehen.
