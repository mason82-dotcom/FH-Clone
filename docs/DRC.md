# DJI Direct Remote Control (DRC)

FH-Clone verwendet für DRC ausschließlich die Richtung der DJI Cloud API:

- Cloud → Gerät: `thing/product/{gateway_sn}/drc/down`
- Gerät → Cloud: `thing/product/{gateway_sn}/drc/up`
- Service-Aufrufe: `thing/product/{gateway_sn}/services`
- Service-Antworten: `thing/product/{gateway_sn}/services_reply`
- Fortschrittsereignisse: `thing/product/{gateway_sn}/events`

## Sequenzen

`drone_control` führt `seq` im `data`-Objekt. Wenn sich einer der Werte `x`, `y`, `h` oder `w` ändert, beginnt die Control-Sequenz wieder bei 0.

Andere neuere DRC-Kommandos und Heartbeats verwenden teilweise eine Envelope-`seq` auf derselben Ebene wie `data`. Da ältere Dokumentation hiervon abweicht, unterstützt `DrcController` die Profile `modern` und `legacy`.

Die Achsen werden im Core absichtlich als `x/y/h/w` behandelt. DJI-Dokumentation verschiedener Produktgenerationen beschreibt die Semantik von x/y nicht durchgehend identisch. UI-Pitch/Roll/WASD-Mapping gehört deshalb in ein produktspezifisches Profil und nicht in den generischen DRC-Transport.

## Rate Limiting

DJI dokumentiert für `drone_control` eine Sendefrequenz von 5–10 Hz. FH-Clone limitiert standardmäßig auf maximal 10 Hz.

## Heartbeat

Der Controller sendet standardmäßig alle 10 Sekunden einen Heartbeat. DJI dokumentiert, dass ein länger inaktiver DRC-Link nach ausbleibenden Heartbeats beendet werden kann.

## Emergency Stop

`drone_emergency_stop` wird über `drc/down` gesendet.

FH-Clone aktiviert danach zusätzlich eine lokale Control-Sperre von standardmäßig 2200 ms. Diese Sperre ist eine defensive FH-Clone-Sicherheitsrichtlinie und **kein als Protokollkonstante behandelter Wert der öffentlichen Cloud-API-Dokumentation**. Der öffentliche Fehlercode 319031 beschreibt allgemein einen Flight-Control-Fehler und wird nicht als belastbarer Nachweis für exakt diese Sperrzeit verwendet.

## FlyTo

`fly_to_point` wird über das `services`-Topic gesendet. Der Zielpunkt steht im Feld `points` als Liste mit genau einem Element. `height` ist laut DJI die Zielpunkt-Ellipsoidhöhe und hat einen dokumentierten Mindestwert von 2 m.

Der Fortschritt kommt über `events` mit `method = fly_to_point_progress`.

`commander_flight_height` wird nicht künstlich in den FlyTo-Zielpunkt eingebettet. Es ist ein separates Flight-Control-/Thing-Model-Setting und wird erst über den dafür verifizierten Property-Pfad gesetzt.

## Control Authority

Der empfohlene Ablauf ist:

1. `flight_authority_grab`
2. `drc_mode_enter` mit den MQTT-Relay-Zugangsdaten
3. DRC-Heartbeat starten
4. `drone_control` mit 5–10 Hz
5. bei Ende `drc_mode_exit`

Die Cloud-API- und die FH-Clone-Control-Authority sind zwei getrennte Ebenen. Ein gültiger DJI-Authority-Status ersetzt keinen FH-Clone-Control-Lease.
