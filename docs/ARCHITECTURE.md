# FH-Clone Architektur

## Zielbild

FH-Clone ist SDK-neutral. DJI Cloud API, Mobile SDK, Payload SDK, Onboard SDK, Edge SDK und spätere Fremdprotokolle werden ausschließlich über Adapter angebunden.

```text
DJI Cloud API ─────┐
DJI MSDK V5 ───────┤
DJI PSDK ──────────┤
DJI OSDK ──────────┤
DJI Edge SDK ──────┤
weitere Adapter ───┘
        │
        ▼
 Adapter Layer
        │
        ├── Raw Messages
        ├── Parameter Samples
        ├── Device State
        └── Capabilities
        │
        ▼
 Aircraft Core
        │
        ├── Device Registry
        ├── Parameter Registry
        ├── Capability Router
        └── Control Authority
        │
        ▼
 API / WebSocket / Storage
        │
        ▼
      WebUI
```

## Verbindliche Regeln

1. Der Core importiert keine DJI-SDK-Typen.
2. Jeder Adapter kapselt seine SDK- oder Protokolltypen vollständig.
3. Rohdaten bleiben zusätzlich zur Normalisierung erhalten.
4. Unbekannte Parameter werden nicht verworfen.
5. Capabilities werden zur Laufzeit pro Gerät und Adapter gemeldet.
6. Mehrere Adapter dürfen ein Gerät gleichzeitig lesen.
7. Schreibende Flugsteuerung benötigt eine eindeutige Control Authority.
8. Nicht verifizierte DJI-Steuerbefehle bleiben deaktiviert.

## Parameterstrategie

Bekannte Parameter werden auf stabile, herstellerunabhängige Schlüssel normalisiert:

- `flight.position.latitude_deg`
- `flight.position.longitude_deg`
- `flight.altitude.relative_m`
- `flight.velocity.horizontal_mps`
- `flight.velocity.vertical_mps`
- `flight.attitude.pitch_deg`
- `flight.attitude.roll_deg`
- `flight.attitude.yaw_deg`
- `power.battery.percent`
- `navigation.gnss.satellites`
- `navigation.rtk.fix_type`
- `camera.*`
- `gimbal.*`
- `payload.*`
- `dock.*`

Jeder normalisierte Messwert behält zusätzlich `rawKey`, Quelle und Zeitstempel. Noch nicht bekannte SDK-Felder werden als `raw.<adapter>.<rawKey>` verfügbar gemacht.

## Capability-Modell

Beispiele:

- `telemetry.flight`
- `telemetry.battery`
- `telemetry.rtk`
- `telemetry.camera`
- `telemetry.gimbal`
- `control.flight`
- `control.rth`
- `control.camera`
- `control.gimbal`
- `mission.wayline`
- `media.read`
- `livestream.read`
- `payload.control`

Ein Adapter darf nur Funktionen anbieten, die er für das konkrete Gerät tatsächlich nachweisen kann.

## Control Authority

Telemetrie darf aus mehreren Quellen zusammengeführt werden. Steuerbefehle werden dagegen zentral serialisiert.

Vor einem schreibenden Befehl müssen mindestens geprüft werden:

1. Geräteverbindung
2. Capability
3. Adapterzustand
4. Control Lease
5. Vorbedingungen
6. Timeout
7. Correlation-ID

## Adapter

### DJI Cloud API

Serverseitiger Adapter für MQTT/HTTPS/WebSocket. Für Phase 1 werden nur Telemetrie und Gerätezustand verarbeitet. Flugsteuerbefehle bleiben deaktiviert, bis Methode und Payload der tatsächlich eingesetzten Cloud-API-Version verifiziert wurden.

### DJI Mobile SDK V5

Läuft als Android-/RC-Bridge. Die Bridge übersetzt SDK-KeyManager- und Gerätewerte in die Core-Verträge.

### DJI Payload SDK / Onboard SDK / Edge SDK

Laufen als native Agenten. Sie kommunizieren über eine versionierte interne Bridge mit dem Core und werden nicht in den Node.js-Prozess eingebettet.

## WebUI

Die React-WebUI konsumiert nur die FH-Clone-API und den FH-Clone-WebSocket. Direkte MQTT-Credentials und direkte Flight-Control-Publishes gehören nicht in den Browser.

Optionale FlightHub-2-Webkomponenten oder OpenFlightHub-Funktionen werden hinter eigenen Adaptern gekapselt und dürfen die Kernarchitektur nicht bestimmen.
