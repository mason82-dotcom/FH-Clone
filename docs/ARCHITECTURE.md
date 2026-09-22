# FH-Clone Gesamtarchitektur

## Zweck

FH-Clone kapselt unterschiedliche Geräte-, Cloud- und Groundstation-Protokolle
hinter einer gemeinsamen Domäne. Der Kern kennt keine konkreten DJI-SDK-Typen.

Das verhindert, dass Frontend, Persistenz oder Missionslogik für jedes
DJI-Produkt neu geschrieben werden müssen.

## Schichten

```text
Externe Systeme
  |
  +-- DJI Cloud API / MQTT
  +-- DJI Mobile SDK V5
  +-- UgCS / UCS
  +-- später ausdrücklich freigegebene Adapter
  |
  v
Adapter-Schicht
  |
  +-- Rohmeldungen
  +-- normalisierte Parameter
  +-- Gerätezustand
  +-- Fähigkeiten
  |
  v
Aircraft Core
  |
  +-- DeviceRegistry
  +-- ParameterRegistry
  +-- CapabilityRouter
  +-- ControlAuthority
  +-- SafetyGate
  +-- Missions-/RTK-Metadaten
  |
  v
Control API / Persistenz / Weboberfläche
```

## Verbindliche Architekturregeln

1. Der Core importiert keine DJI-SDK-Typen.
2. Adapter kapseln Herstellerprotokolle vollständig.
3. Rohdaten bleiben zusätzlich zur Normalisierung erhalten.
4. Unbekannte Felder werden nicht verworfen.
5. Fähigkeiten werden pro Gerät und Adapter zur Laufzeit bestimmt.
6. Mehrere Adapter dürfen dasselbe Gerät gleichzeitig lesen.
7. Schreibende Steuerung benötigt eine eindeutige Control Authority.
8. Flugkritische Funktionen unterliegen zusätzlich dem SafetyGate.
9. Die Weboberfläche spricht für FH-Clone-Domänen ausschließlich mit der FH2-Control-API.
10. Ausnahme: offizielle FlightHub-2-On-Premises-Standalone-Komponenten dürfen direkt über `window.FH2` mit ihrer DJI-Runtime kommunizieren.
11. Browser erhalten keine direkten MQTT- oder FH-Clone-DRC-Credentials.
12. `gateway_sn` und `device_sn` werden nicht zusammengelegt.
13. `main` ist die einzige Integrationslinie für V3.

## Rohdaten und Normalisierung

Jede eingehende Herstellerinformation soll in zwei Ebenen verfügbar sein.

### Rohdaten

Die Originalnachricht wird mit mindestens folgenden Metadaten geführt:

```text
adapterId
deviceId
channel
receivedAt
payload
```

### Normalisierte Parameter

Bekannte DJI-Felder werden auf stabile Schlüssel abgebildet, zum Beispiel:

- `flight.position.latitude_deg`
- `flight.position.longitude_deg`
- `flight.altitude.relative_m`
- `flight.altitude.ellipsoid_m`
- `flight.velocity.horizontal_mps`
- `flight.velocity.vertical_mps`
- `flight.attitude.pitch_deg`
- `flight.attitude.roll_deg`
- `flight.attitude.yaw_deg`
- `navigation.gnss.gps_satellites`
- `navigation.rtk.satellites`
- `navigation.rtk.fix_status`
- `camera.*`
- `gimbal.*`
- `payload.*`

Noch nicht fachlich normalisierte Felder bleiben unter:

```text
raw.<adapter>.<rawKey>
```

Damit gehen neue DJI-Felder nicht verloren, bevor ein stabiler
Domänenvertrag existiert.

## Capability-Modell

Beispiele:

- `telemetry.flight`
- `telemetry.battery`
- `telemetry.rtk`
- `telemetry.camera`
- `telemetry.gimbal`
- `media.read`
- `livestream.read`
- `control.camera`
- `control.gimbal`
- `payload.control`
- `mission.wayline`
- `control.flight`
- `control.rth`

Eine Capability in `AdapterDevice.capabilities[]` darf nur gemeldet werden,
wenn der aktive Adapter sie für das konkrete Gerät über seinen vorgesehenen
Adapterpfad tatsächlich erfüllen kann.

Herstellerseitig dokumentierter Produktsupport ist davon getrennt. Spezielle
Runtime-Pfade wie der M4-`ControlCoordinator`/DRC-Flow dürfen eigene
Support-Flags besitzen, ohne dadurch eine nicht ausführbare generische
`AircraftAdapter.execute()`-Capability vorzutäuschen.

## Gateway- und Geräteidentität

DJI Pilot 2 kann ein Gateway mit untergeordneten Geräten melden:

```text
RC Pro / RC Plus 2     -> gateway_sn
Aircraft               -> device_sn
Payload/Kamera         -> weitere Produktidentität
```

Die Beziehung wird unter anderem über `update_topo` gelernt.

Telemetrie kann unter `device_sn` eintreffen, während Services über
`gateway_sn` laufen. Deshalb bleibt die Topologie eine eigene Domäne.

## Steuerhoheit

Vor jedem schreibenden Befehl werden mindestens geprüft:

1. Geräteverbindung
2. gemeldete Capability
3. aktiver Adapter
4. gültiger Control Lease
5. Safety-Stufe
6. produktspezifische Vorbedingungen
7. Timeout
8. Correlation-ID

Für DJI-Cloud-Flugsteuerung kommen zusätzlich DJI Control Authority,
DRC-Sitzungszustand und Dead-Man hinzu.

## Safety-Stufen

| Stufe | Bedeutung |
| --- | --- |
| FC0 | Lesen, Analyse, Planung; keine realen Steuer-Downlinks |
| FC1 | kontrollierte nicht flugkritische Schreibzugriffe |
| FC2 | Missions-/Task-Steuerung |
| FC3 | Flugsteuerung, RTH und DRC |

Die Standardstufe ist FC0. Capability-Erkennung hebt die Safety-Stufe niemals
automatisch an.

## Adapter

### DJI Cloud API

Serverseitige MQTT-/HTTPS-Integration. Der aktuelle Schwerpunkt liegt auf:

- Basic Link
- Telemetrie
- Topologie
- Services/Replies
- RTK
- Payload-/Capability-Erkennung

DRC ist technisch separat implementiert und nicht Teil der permanenten
Basic-Link-Berechtigung.

### Livestreaming

Der verbindliche FH2-Livestreamingpfad ist selbst gehostet:

```text
DJI Pilot 2 / RC Pro Enterprise
  -> DJI Cloud API live_start_push
  -> RTMP
  -> MediaMTX
  -> WebRTC
  -> FH2 WebUI
```

HLS darf als Fallback angeboten werden.

Der FlightHub-2-/SIKONG-CE-Bezahlstream bleibt deaktiviert. Der Browser erhält
keine RTMP-Publish- oder DJI-Credentials. Start/Stop/Lens/Quality laufen
serverseitig über den vorhandenen DJI-`services/services_reply`-Pfad.

Details: [LIVESTREAM.md](LIVESTREAM.md).

### DJI Mobile SDK V5

Vorgesehener Android-/RC-Adapter. SDK-KeyManager- und Gerätewerte werden in
die Core-Verträge übersetzt. Ein MSDK-Adapter darf keine DJI-Typen in den Core
durchreichen.

### UgCS

UgCS ist ein eigenständiger Groundstation-Adapter. DJI-Geräteintegration und
Groundstation-Missionslogik bleiben getrennte Verantwortungsbereiche.

### Weitere SDKs

PSDK, OSDK, Edge SDK oder Fremdprotokolle werden erst aufgenommen, wenn ein
konkreter V3-Release-Gate- oder späterer Projektauftrag dies verlangt. Für den
aktuellen V3-Abschluss gilt Feature-Freeze.

## Persistenz

V3 verwendet TimescaleDB auf PostgreSQL-Basis. Ein erstes Schema und die automatische Missionspersistenz sind bereits vorhanden. Vollständig zu persistieren sind:

- Rohmeldungen
- normalisierte Parameter
- Geräte
- Gateway-/Sub-Device-Topologie
- AuthN-/AuthZ-Audit
- Media-Metadaten
- Missions- und RTK-Kontext

Die Persistenz ersetzt nicht die In-Memory-Registries, sondern ergänzt sie um Neustartfestigkeit und Historie. Details: [PERSISTENZ.md](PERSISTENZ.md).

## Weboberfläche

Die React-Weboberfläche besitzt zwei klar getrennte Integrationspfade:

1. **FH-Clone-Domänen** konsumieren die öffentliche Control API. Dazu gehören
   Telemetrie, RTK, Topologie, Safety, eigener DRC, Persistenz und UgCS.
2. **Offizielle FlightHub-2-Standalone-Komponenten** verwenden direkt die vom
   On-Premises-System gelieferte Browser-Runtime `window.FH2`.

Der direkte DJI-Frontendpfad umfasst:

- Project Map
- Wayline Creation
- Wayline Editor
- Flight Path Viewer
- Virtual Cockpit
- Gateway + Aircraft Identity
- einen gemeinsamen `initConfig`-Kontext
- Eventbus
- Cesium Viewer Bridge
- CSS-Theme-Variablen
- explizite `load*()/destroy*()`-Lifecycles
- getrennte Bereiche für Routenplanung und Flugverlauf

Dieser Pfad ist **keine** Freigabe für Browser-MQTT oder direkte
FH-Clone-DRC-Publishes. Das native DJI Virtual Cockpit ist ein eigener
FlightHub-Control-Pfad und standardmäßig deaktiviert.

Details: [FH2_STANDALONE_FRONTEND.md](FH2_STANDALONE_FRONTEND.md).
