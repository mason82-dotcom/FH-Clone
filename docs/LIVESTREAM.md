# FH2 Livestreaming

## Verbindlicher Standard

FH2 verwendet für Livestreaming den selbst gehosteten Pfad:

```text
DJI Aircraft Camera
        |
        | DJI AirLink
        v
DJI RC Pro Enterprise / DJI Pilot 2
        |
        | DJI Cloud API: live_start_push
        | RTMP Push
        v
MediaMTX auf dem FH2-Server
        |
        +--> WebRTC -> FH2 WebUI / Browser
        |
        +--> HLS -> optionaler Fallback
```

Damit gilt:

```text
DJI -> RTMP ingest -> MediaMTX -> WebRTC -> Browser
```

als verbindlicher FH2-Livestreaming-Standard.

## Abgrenzung zu FlightHub 2 / SIKONG CE

Der kostenpflichtige FlightHub-2-/SIKONG-CE-Livestream bleibt deaktiviert.

FH2 verwendet für den eigenen Livestream **nicht**:

```text
POST /openapi/v2.0/live-stream/start
```

und aktiviert keine FlightHub-Sync-/Forwarding-Kanäle für diesen Zweck.

Der Self-Hosted-Pfad basiert stattdessen auf der DJI Cloud API und einem
eigenen Streaming-Media-Server.

## DJI Cloud API Vertrag

Für DJI Pilot 2 / RC Pro Enterprise wird der dokumentierte Service-Pfad
verwendet:

```text
Topic:
thing/product/{gateway_sn}/services

Start:
method = live_start_push

Stop:
method = live_stop_push

Qualität:
method = live_set_quality

Linse:
method = live_lens_change
```

Antworten werden über:

```text
thing/product/{gateway_sn}/services_reply
```

korreliert.

Für den Self-Hosted-Standard wird beim Start:

```text
url_type = 1
```

verwendet, also RTMP.

Die Ziel-URL zeigt ausschließlich auf den eigenen MediaMTX-Server, zum Beispiel:

```text
rtmp://<fh2-media-host>:1935/fh2/<stream-key>
```

Konkrete Hostnamen, Adressen, Tokens oder Stream-Keys sind
Laufzeitkonfiguration und werden nicht im Repository hardcodiert.

## Video-Identität

`video_id` wird nicht aus Produktnamen oder festen Kameraannahmen erzeugt.

Die verfügbare Livestream-Struktur wird aus DJIs `live_capacity` und den
zur Laufzeit gemeldeten Kamera-/Videoquellen abgeleitet.

Verbindliche Regel:

```text
live_capacity / runtime camera topology
        ->
gültige video_id
        ->
live_start_push
```

Keine statische `video_id` pro Aircraft-Modell.

## MediaMTX Rolle

MediaMTX ist der verbindliche FH2-Medienserver für Livevideo.

Seine Aufgaben:

- RTMP-Ingest von DJI Pilot 2
- WebRTC-Ausgabe an moderne Browser
- optional HLS als Kompatibilitätsfallback
- Stream-Lifecycle auf dem eigenen Server
- keine DJI-/MQTT-Secrets im Browser

MediaMTX ersetzt weder den DJI-MQTT-Broker noch die FH2-Control-API.

## Browserpfad

Die FH2-WebUI konsumiert den Stream ausschließlich über den eigenen
MediaMTX-Ausgabepfad.

Primär:

```text
WebRTC
```

Fallback:

```text
HLS
```

Der Browser erhält:

- keine DJI-MQTT-Credentials
- kein Gateway-Passwort
- keine FlightHub-`X-User-Token`
- keine DRC-Credentials
- keinen RTMP-Publish-Key

## Safety- und Control-Grenze

Livestream-Start/-Stop ist ein schreibender DJI-Service, bewegt das Aircraft
aber nicht.

Für FH2 wird der Livestream-Service deshalb als **FC1** behandelt.

FC1 erlaubt ausschließlich den kontrollierten, nicht flugkritischen
Livestream-Service. Daraus entsteht keine:

- FC2-Missionsfreigabe
- FC3-Flugsteuerungsfreigabe
- DJI Flight Control Authority
- DRC-Sitzung

`live_start_push` darf diese Zustände weder implizit anfordern noch verändern.

## Lifecycle

Ein Stream ist ressourcenaktiv, sobald Pilot 2 erfolgreich auf MediaMTX
pusht. Viewerzahl und Source-Status sind getrennte Zustände.

FH2 muss mindestens unterscheiden:

```text
requested
starting
streaming
stopping
stopped
error
```

Zusätzlich getrennt:

```text
source streaming
viewer connected
```

Der Stream wird explizit mit `live_stop_push` beendet. Ein Browser-Disconnect
allein ist kein verlässlicher Stop-Nachweis.

Ein späterer automatischer Idle-Stop darf nur auf einem expliziten,
dokumentierten FH2-Lifecycle beruhen.

## Qualität und Kamerawechsel

DJI dokumentiert folgende Qualitätsstufen:

```text
0 Adaptive
1 Smooth
2 Standard definition
3 High definition
4 Ultra-high definition
```

FH2 reicht diese Werte nicht blind aus der UI durch. Die WebUI verwendet
einen typisierten Wert und der Adapter setzt daraus den DJI-Wert.

Kamera-/Lens-Wechsel erfolgt über `live_lens_change` und nur mit einer
zur Laufzeit bekannten `video_id` beziehungsweise einer dokumentierten
`video_type`.

## Capability-Regel

Der Herstellerhinweis `live_capacity` allein reicht nicht aus, um
`livestream.read` zu annoncieren.

Erst wenn der komplette Pfad:

```text
DJI service
-> RTMP ingest
-> MediaMTX
-> WebRTC/HLS
-> Browser
-> Stop/Lifecycle
```

implementiert und getestet ist, darf der Adapter `livestream.read`
für das konkrete Gerät melden.

Bis dahin:

```text
LIVESTREAM_STANDARD = MEDIAMTX_RTMP_WEBRTC
LIVESTREAM_IMPLEMENTATION = TARGET
livestream.read = NOT_ADVERTISED
FLIGHTHUB_SIKONG_CE_STREAM = DISABLED
```

## Real zu verifizieren

Vor Freigabe müssen mindestens mit realer DJI-Hardware geprüft werden:

- tatsächliches `live_capacity`
- dynamische `video_id`
- RTMP-Push von Pilot 2 auf MediaMTX
- Start-/Stop-`services_reply`
- Quality-Wechsel
- Lens-Wechsel
- Verhalten bei RC-/Aircraft-Reconnect
- Verhalten bei MediaMTX-Ausfall
- Browser-WebRTC-Wiedergabe
- optionaler HLS-Fallback
- Stop nach Verbindungsverlust/Fehler
- keine Reaktivierung eines alten Streams nach Backend-Neustart

## Herstellerreferenz

Primäre DJI-Quelle:

```text
dji-sdk/Cloud-API-Doc
docs/en/30.feature-set/10.pilot-feature-set/30.pilot-livestream.md
docs/en/60.api-reference/10.pilot-to-cloud/00.mqtt/20.rc-pro/20.live.md
```

DJI beschreibt dort die Drittplattform mit eigenem MQTT- und
Streaming-Media-Server sowie `live_start_push`, `live_stop_push`,
`live_set_quality` und `live_lens_change`.
