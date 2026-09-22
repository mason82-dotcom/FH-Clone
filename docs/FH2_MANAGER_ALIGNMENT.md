# Abgleich FH2 V3 und M4-Cloud V2

## Zweck

M4-Cloud V2 und FH-Clone/FH2 V3 sind getrennte Projekte mit unterschiedlichen
Schwerpunkten.

Der Abgleich verhindert, dass Sicherheits- oder Protokollregeln
widersprüchlich umgesetzt werden.

## Verbindliche DJI-OpenAPI-V2-Referenz

Für den FlightHub-2-OpenAPI-V2-Pfad gilt zusätzlich das offizielle DJI-Repository

`dji-sdk/FlightHub-2-OpenAPI-V2-Demo`

als Upstream-Referenz. Die vom Projektinhaber bereitgestellte
`OpenAPI-V2-Demo.zip` wurde über die Git-Blob-SHAs gegen den aktuellen
DJI-`main`-Stand geprüft; die enthaltenen Dateien entsprechen dem offiziellen
Stand.

Für FH2 gelten daraus folgende Referenzstufen:

1. **Privatization** ist der primäre API-Vertrag für das lokale/On-Premises-
   FlightHub-2-Szenario.
2. **Shared/request.ts** und **Shared/types.ts** sind Referenz für
   Header-, Query- und DJI-`code/data/message`-Semantik.
3. **PublicCloud** ist eine Vergleichsreferenz. Public-Cloud-spezifische
   Endpunkte werden nicht automatisch auf Privatization übertragen.
4. Demo-Polling von 30 Sekunden ist ein zulässiges Muster für
   Inventar-/Task-/Supervision-Snapshots, nicht für hochfrequente
   Flugtelemetrie.
5. Schreibende Demo-Funktionen wie
   `POST .../flight-tasks` sind keine automatische FH2-Freigabe. In FH2
   bleiben FC-Stufe, Control Authority, Lease und Release-Freeze maßgeblich.
6. DJI-Tokens aus der Server-OpenAPI bleiben in FH2 serverseitige Secrets.
   Ein Demo-`KeyCenter.ts` ist kein Sicherheitsmuster für die produktive
   Browserarchitektur.

Als normative Referenz gelten insbesondere:

- `Privatization/DeviceList`
- `Privatization/FlightTaskLibrary`
- `Shared/request.ts`
- `Shared/types.ts`
- die zugehörigen README-Verträge

Bei späterem Drift zwischen dem gespeicherten ZIP-Snapshot und dem offiziellen
DJI-Repository wird vor einer Änderung der aktuelle DJI-Upstream erneut
verifiziert.

Zusätzlich gilt der vom Projektinhaber bereitgestellte Snapshot
`OpenAPI_related_errorcodes.txt` als projektinterne Fehlerreferenz. Die Codes
sind vollständig in `docs/FH2_OPENAPI_FEHLERCODES.md` hinterlegt. Sie dienen
zur Diagnose und Log-Korrelation, erzeugen aber ohne bestätigten API-Kontext
keine automatische Retry-, Safety- oder FC-Entscheidung.

## Verbindliche DJI-SDK-/Cloud-Referenzen

Zusätzlich zur FlightHub-2-OpenAPI-V2-Demo gelten für FH2 folgende offizielle
DJI-Repositories als normative Upstream-Referenzen:

### FlightHub-2-Livestream-Semantik

Für FlightHub-2-OpenAPI und FlightHub-Sync/Forwarding gilt:

- `POST /openapi/v2.0/live-stream/start` wählt **kein** Streamingprotokoll aus.
  Der Request enthält Geräte-/Kamera-ID, Ablaufzeit und Qualität. Das von
  FlightHub bereitgestellte Ergebnis liefert `url`, `expire_ts` und
  `url_type`; der Client verwendet den von DJI zurückgegebenen Provider-/URL-
  Typ.
- Diese Einschränkung gilt für FlightHub-2-OpenAPI. Sie darf **nicht** auf die
  DJI Cloud API verallgemeinert werden: deren Livestream-Service kennt
  `url_type` und dokumentiert unter anderem Agora, RTMP, GB28181 und WebRTC.
- Ein aktivierter OpenAPI-/Sync-Forwarding-Kanal ist ein **aktiver Stream**.
  Verbrauch/Betriebsdauer beginnt mit dem aktivierten Kanal und nicht erst mit
  einem verbundenen Zuschauer. Solange Quelle online und Kanal offen ist, kann
  Streamingdauer anfallen.
- Deshalb müssen `channel enabled`, `source streaming` und
  `viewer connected` im FH2-Datenmodell getrennte Zustände bleiben.
- Für FlightHub-2-On-Premises sind Livestream-Minuten laut aktuellem DJI-
  Paketmodell unbegrenzt. Das ändert nicht, dass ein offener Kanal Netzwerk-,
  Encoder- und Streaming-Ressourcen belegt.

FH2 darf einen Forwarding-Kanal daher nicht allein deshalb offenlassen, weil
aktuell kein Viewer verbunden ist. Ein späterer Livestream-Controller braucht
einen expliziten Stop-/Disable-Lifecycle.

## DJI Cloud API

Repository:

`dji-sdk/Cloud-API-Doc`

Referenzbranch:

`master`

Primärer Dokumentationspfad:

`docs/en`

Zuständigkeit in FH2:

- MQTT-Topic-Verträge
- Basic Link
- `update_topo`
- OSD/State
- Events/Requests/Services/Replies
- DRC
- Product-/Payload-Properties
- RC-/Aircraft-/Dock-Cloud-Verhalten
- Cloud-Control-Authority und cloudseitige Capabilities

Bei Cloud-API-Protokollfragen hat diese Quelle Vorrang vor Beispielcode,
Blogbeiträgen und abgeleiteten Drittquellen.

### DJI Mobile SDK V5 – Android

Repository:

`dji-sdk/Mobile-SDK-Android-V5`

Aktueller Referenzbranch:

`dev-sdk-main`

Aktuell dokumentierter SDK-Stand:

`5.18.0`

Zuständigkeit in FH2:

- reale MSDK-V5-Implementierungsmuster
- KeyManager-/Action-/Value-Nutzung
- Produkt-/Komponentenverhalten auf Android
- Payload-, Kamera-, Gimbal-, FlightController- und RTK-Integration
- Beispielcode für gerätenahe Funktionen
- Abgleich der späteren MSDK-V5-Bridge

Der Sample-Code ist Referenz für SDK-Verwendung, aber kein automatisches
Sicherheits- oder Architekturmodell für den FH2-Server.

### DJI Mobile SDK V5 – API-Dokumentation

Repository:

`dji-sdk/Mobile-SDK-Doc-V5`

Aktueller Default-/Release-Referenzbranch:

`sdk_releases/v_5.18.0`

Zuständigkeit in FH2:

- API-Signaturen
- Keys, Enums und Datentypen
- dokumentierte Produktunterstützung
- Komponenten-/Capability-Semantik
- Parametergrenzen und dokumentierte Zustandswerte
- Abgleich zwischen Cloud-API- und MSDK-Begriffen

### Referenzhierarchie

Wenn Quellen unterschiedliche Ebenen beschreiben, gilt:

```text
Cloud-Vertrag / MQTT
  -> Cloud-API-Doc

MSDK API-Semantik / Typen / Keys
  -> Mobile-SDK-Doc-V5

MSDK reale Implementierung / Beispielnutzung
  -> Mobile-SDK-Android-V5

FlightHub 2 Privatization REST
  -> FlightHub-2-OpenAPI-V2-Demo/Privatization
```

Ein MSDK-Key oder Sample erzeugt **keine** Cloud-API-Capability und ein
Cloud-API-Property erzeugt **keine** MSDK-Verfügbarkeit. FH2 hält beide
Integrationspfade getrennt und vereinheitlicht sie erst im SDK-neutralen Core.

Bei späterem Drift wird vor einer produktiven Änderung immer der aktuelle
offizielle DJI-Upstream gegen den im Projekt dokumentierten Referenzstand
geprüft.

## Referenzstand M4

M4-Cloud bleibt der stabile V2-Referenzpfad für:

- FlightHub 2 Privatization OpenAPI V2
- read-only FH2-Ressourcen
- DJI Cloud API Bootstrap
- Basic-Link-MQTT
- dynamische Kamera-/Videopfad-Erkennung
- lokale Betriebs-/Verify-Abläufe

M4 V2 bleibt eingefroren, solange kein neuer ausdrücklicher Auftrag erfolgt.

## FH2 V3

FH-Clone entwickelt die umfassendere modulare Zielarchitektur:

- SDK-neutraler Aircraft Core
- dynamische Geräte-/Capability-Registry
- EMQX AuthN/AuthZ
- Gateway-/Sub-Device-Topologie
- RTK
- WebUI
- Media/Multispektral
- UgCS
- Control Authority und Safety
- optionaler DRC-Code unter FC3

## Gemeinsame Sicherheitsstufen

| Stufe | Bedeutung |
| --- | --- |
| FC0 | Analyse, Lesen und Planung |
| FC1 | kontrollierte nicht flugkritische Schreibzugriffe |
| FC2 | Mission/Task |
| FC3 | Flugsteuerung, RTH, DRC |

FH2 startet immer auf FC0.

## FlightHub 2 OpenAPI V2

M4 bleibt die verifizierte Referenz für die aktuell verwendeten
read-only-Ressourcen, darunter:

- Devices
- HMS
- Waylines
- Flight Tasks

Verwendete Header:

- `X-User-Token`
- `X-Project-Uuid`
- `X-Request-Id`
- `X-Language`

FH2 erfindet keine nicht dokumentierten Write-Endpunkte.

## DJI Cloud API

DJI Cloud API und FlightHub-2-OpenAPI bleiben getrennte Integrationspfade.

Gemeinsame Konzepte:

- Basic Link
- `gateway_sn` / `device_sn`
- `update_topo`
- OSD/State
- Services/Replies
- Capability-Gating

## MQTT-Broker

M4 V2 verwendet Mosquitto mit statischer, restriktiver Basic-Link-Konfiguration.

FH2 V3 verwendet EMQX mit dynamischer Gateway-/Topologie-Autorisierung.

Das ist kein Topic-Protokollkonflikt. FH2 V3 erweitert das
Sicherheitsmodell, ohne den eingefrorenen M4-V2-Stack stillschweigend
umzubauen.

## RC Pro

Gemeinsames Topologiemodell:

```text
Controller gateway_sn
      |
      +-- Aircraft device_sn
```

FH2 V3 geht darüber hinaus und entkoppelt die MQTT-Client-ID vollständig von
der Sicherheitsidentität.

## Kamera und Medien

Stabile gemeinsame Begriffe bleiben:

- `device_sn`
- `payload_index`
- `video_index`
- `video_type`
- `video_id`
- `lens_index`
- `live_source`
- `zoom_factor`
- `focal_length_mm`
- `iso`
- `shutter_speed`

FH2 V3 ergänzt darauf aufbauend den Media-/Sensor-/Bandvertrag.

## DRC

M4 V2 bleibt DRC-frei.

FH2 V3 darf DRC-Code enthalten, aber nur als standardmäßig gesperrte
FC3-Funktion mit:

- Control Lease
- DJI Authority
- separater DRC-Sitzung
- Dead-Man
- Broker-Isolation

## CI

Nur der Direktor startet die finale zentrale CI.

Nach V3.0 endet die FH2-Entwicklung, sofern kein neuer ausdrücklicher Auftrag
erteilt wird.
