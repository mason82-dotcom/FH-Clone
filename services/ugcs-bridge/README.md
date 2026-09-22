# FH-Clone UgCS UCS Bridge

Read-first Bridge zwischen FH-Clone und dem UgCS Universal Control Server (UCS).

## Verifizierte Basis

- UgCS Java SDK: 5.17.1
- UgCS HCI protocol: v2.0 laut Release 5.17.1
- UCS Standardport für Desktop-Clients: TCP 3334
- Java SDK unterstützt Fahrzeuge, Routen, Telemetrie, Route Processing/Upload und Fahrzeugkommandos.

## Aktueller Funktionsumfang

Die Bridge aktiviert absichtlich nur lesende HTTP-Endpunkte:

- `GET /health`
- `GET /vehicles`
- `GET /routes`
- `GET /telemetry`

Schreibende UgCS-Befehle werden erst über den zentralen FH-Clone Command-/Authority-Pfad freigegeben.

## Umgebungsvariablen

- `UGCS_HOST` – Standard `localhost`
- `UGCS_PORT` – Standard `3334`
- `UGCS_USER` – UgCS-Benutzer
- `UGCS_PASSWORD` – UgCS-Passwort
- `BRIDGE_BIND` – Standard `0.0.0.0`
- `BRIDGE_PORT` – Standard `8092`

Zugangsdaten gehören in Runtime-Secrets und niemals ins Repository.

## Build

```bash
mvn -B -DskipTests package
```

Die SDK-Abhängigkeit wird entsprechend der offiziellen UgCS-Java-SDK-Dokumentation über JitPack bezogen.
