# DJI Direct Remote Control (DRC)

FH-Clone verwendet für DRC ausschließlich die Topic-Richtung der DJI Cloud API:

- Cloud → Gerät/Pilot: `thing/product/{gateway_sn}/drc/down`
- Gerät/Pilot → Cloud: `thing/product/{gateway_sn}/drc/up`
- Service-Aufrufe: `thing/product/{gateway_sn}/services`
- Service-Antworten: `thing/product/{gateway_sn}/services_reply`
- Fortschrittsereignisse: `thing/product/{gateway_sn}/events`

Aircraft-OSD/State bleiben davon getrennt und werden über `device_sn` verarbeitet.

## Zwei MQTT-Pfade

`drc_mode_enter` läuft über den normalen Cloud-Servicekanal. Sein Payload übermittelt dem Gerät die Zugangsdaten des DRC-MQTT-Relays.

Deshalb trennt FH-Clone:

1. **ServiceRequester** – normaler Cloud-Broker; `services` / `services_reply`, TID/BID-Korrelation.
2. **DRC Publisher** – DRC-Relay; `drc/down` für Control und Heartbeat.

Beide können technisch auf demselben EMQX laufen, werden im Code aber nicht als identisch vorausgesetzt.

## Produktspezifische DRC-Profile

DRC wird nicht mehr als ein einziges universelles Steuerprotokoll behandelt.

```ts
type DjiDrcProfile =
  | "none"
  | "pilot-m3-payload"
  | "pilot-m4-stick"
  | "dock-velocity";
```

Die Auswahl erfolgt aus der zur Laufzeit erkannten Gateway↔Aircraft-Topologie.

### Mavic 3 Enterprise Series + RC Pro Enterprise

- Aircraft type: `77`
- Gateway type: `144`
- Pilot-Cloud: Payload-Control
- keine automatische `control.flight`-Capability
- physische RC-Sticks bleiben der Flugsteuerung zugeordnet

### Matrice 4 Series + RC Plus 2

- Aircraft type: `99`
- Gateway type: `174`
- Pilot-Cloud: Flight + Payload Control
- Pointing Flight und Orbit/POI Flight werden als eigene Capabilities geführt
- Flight Control verlangt DJI-Control-Authority **und** FH-Clone Safety Stage FC3

Die Capability-Erkennung schaltet FC3 niemals selbst frei.

## Aktuelles Stick-Control-Protokoll

Für aktuelle Pilot-/DRC-Pfade verwendet DJI:

- Topic: `thing/product/{gateway_sn}/drc/down`
- Method: `stick_control`
- Sendefrequenz: 5–10 Hz
- kein ACK
- `seq` auf Envelope-Ebene

Kanäle:

| Feld | Bereich | Neutral |
| --- | ---: | ---: |
| `roll` | 364..1684 | 1024 |
| `pitch` | 364..1684 | 1024 |
| `throttle` | 364..1684 | 1024 |
| `yaw` | 364..1684 | 1024 |

FH-Clone stellt dafür `sendStickControl()`, `sendNeutralStickControl()` sowie die Konvertierung aus normierten `-1..1`-Werten bereit.

Die UI publiziert diese Werte **nicht direkt**. Browser-Input muss über Control Authority und Safety Gateway laufen.

## Legacy Velocity Control

`drone_control` mit `x/y/h/w` bleibt im Adapter nur als expliziter Legacy-/Kompatibilitätspfad erhalten.

DJI markiert diesen DRC-Flight-Control-Pfad in aktueller Dokumentation als nicht mehr gepflegt und empfiehlt `stick_control`.

Die alte Sequenzlogik bleibt deshalb isoliert:

- `seq` liegt in `data`
- bei Änderung von `x/y/h/w` beginnt die Legacy-Sequenz erneut bei 0

Sie darf nicht automatisch für RC Plus 2/Matrice 4 verwendet werden.

## Service ACK

`DjiCloudAdapter.requestService()` erzeugt `tid`, `bid`, Timestamp und wartet auf das korrelierte `services_reply`.

DRC-Mode-Enter, Authority-Grab, Exit und FlyTo sind damit keine Fire-and-Forget-Operationen.

Stick-Control ist davon ausdrücklich ausgenommen: DJI definiert dafür keinen ACK.

## Rate Limiting

FH-Clone limitiert DRC-Control standardmäßig auf maximal 10 Hz.

Der Aufrufer muss während aktiver Stick-Steuerung einen stabilen 5–10-Hz-Datenstrom sicherstellen. Ein einzelnes gesendetes Stick-Paket stellt keine dauerhafte Steuerung dar.

## Heartbeat

Der Controller sendet standardmäßig alle 10 Sekunden einen Heartbeat. DJI dokumentiert, dass ein länger inaktiver DRC-Link nach ausbleibenden Heartbeats beendet werden kann.

Lokale Safety-Watchdogs dürfen strenger reagieren als der DJI-Protokolltimeout.

## Emergency Stop

`drone_emergency_stop` wird über `drc/down` gesendet.

FH-Clone aktiviert danach zusätzlich eine lokale Control-Sperre von standardmäßig 2200 ms. Diese Sperre ist eine defensive FH-Clone-Sicherheitsrichtlinie und **keine DJI-Protokollkonstante**.

Emergency-Kommandos bleiben FC3 und müssen separat auditiert werden.

## FlyTo

`fly_to_point` wird über das `services`-Topic gesendet.

Der Zielpunkt steht im Feld `points` als Liste mit genau einem Element. `height` ist die Zielpunkt-Ellipsoidhöhe und darf nicht mit relativer Höhe über dem Startpunkt verwechselt werden.

Der Fortschritt kommt über `events` mit `method = fly_to_point_progress`.

## Control Authority

Empfohlener M4-Pfad:

1. Gateway/Aircraft über `update_topo` identifizieren
2. Capability-Profil prüfen
3. FH-Clone Control Lease erwerben
4. Safety Stage FC3 prüfen
5. DJI Flight-Control-Authority erwerben/bestätigen
6. `drc_mode_enter` mit DRC-Broker-Zugangsdaten
7. Heartbeat starten
8. `stick_control` mit 5–10 Hz
9. bei Ende neutralisieren und `drc_mode_exit`

Die DJI-Control-Authority und die FH-Clone-Control-Authority sind zwei getrennte Ebenen. Keine der beiden ersetzt die andere.

## Payload-Identitäten

Stabile Kamera-IDs werden zentral im DJI-Adapter registriert, aber Lens-/Video-Pfade weiterhin dynamisch gelernt.

Aktuell relevante Hauptkameras:

- M3E: `66-0-0`
- M3T: `67-0-0`
- M3TA: `129-0-0`
- M4E: `88-0-0`
- M4T: `89-0-0`

Damit bleiben Thermal-, Multispektral- und Videoquellen getrennt modellierbar.

## Referenzen

- DJI Product Support: https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- DJI Pilot DRC: https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/pilot-feature-set/drc.html
- RC Plus 2 Remote Control: https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/dji-rc-plus-2/remote-control.html
