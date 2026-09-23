# DJI Direct Remote Control (DRC)

## Sicherheitsstatus

DRC-Code ist auf `main` vorhanden, bleibt aber standardmäßig gesperrt.

```text
Safety Stage = FC0
DRC = nicht freigegeben
```

Der EMQX-Authorizer vergibt DRC-Rechte nur für eine **aktuelle Runtime-Sitzung**.
Im Standardbetrieb unter FC0 existiert keine solche Sitzung; dadurch bleiben
`drc/up` und `drc/down` brokerseitig gesperrt.

Persistierte Inventar-, Missions- oder Auditdaten dürfen eine DRC-Sitzung
niemals wiederherstellen oder autorisieren.

## Trennung von Basic Link und DRC

DRC ist keine dauerhafte Basic-Link-Berechtigung.

```text
Basic-Link-Servicekanal
  +-- services
  +-- services_reply
  +-- status
  +-- osd/state
  +-- events

DRC-Sitzung
  +-- drc/down
  +-- drc/up
  +-- Heartbeat
  +-- Steuerframes
```

`drc_mode_enter` wird über den Servicekanal ausgehandelt. Erst danach darf
ein eigener DRC-Relay-Kontext existieren.

## Topic-Richtung

Während einer tatsächlich freigegebenen DRC-Sitzung:

```text
Cloud -> Gateway
thing/product/{gateway_sn}/drc/down

Gateway -> Cloud
thing/product/{gateway_sn}/drc/up
```

Diese Topics stehen nicht in der permanenten Basic-Link-ACL und werden auch
nicht mehr als Default-Subscriptions des Basic-Link-Adapters geführt.

Der Datenpfad für DRC ist `DrcBrokerTransport`; der normale DJI-Basic-Link
bleibt davon getrennt.

## Produktprofile

Der DJI-Adapter kennt die DJI-Protokollprofile weiterhin als Typinformation.
Die Runtime-Auswahl für den Stick-Pfad ist wieder produktabhängig:

```text
M4E/M4T + RC Plus 2 -> DjiDrcProfile = pilot-m4-stick
M3 Enterprise       -> DjiDrcProfile = none
unbekannt/falsch    -> DjiDrcProfile = none
```

`drone_control` bleibt zusätzlich als separater DJI-DRC-Pfad aktiv.

### Mavic 3 Enterprise + RC Pro Enterprise

DJI dokumentiert Payload-/Kamera-/Gimbal-Steuerung, FH2 V3 implementiert dafür
aber noch keinen ausführbaren Command-Pfad.

Daher gilt aktuell:

```text
DjiDrcProfile = none
keine schreibende AdapterDevice-Capability
keine Cloud-Flugsteuerung
```

Die Herstellerunterstützung bleibt in der Capability-Matrix dokumentiert.

### Matrice 4 + RC Plus 2

DJI dokumentiert für diesen Pfad Stick-Control und Cloud-Control-Authority.
FH2 hält die zugehörigen Protokollbausteine als Referenz vor, aktiviert
`stick_control` beziehungsweise manuelle DRC-Flugsteuerung aber global nicht.

FlyTo bleibt davon als separater Servicepfad getrennt.

## DJI-Control-Authority

### Pilot Cloud / RC Plus 2

Der aktuelle Pilot-Cloud-Pfad verwendet den expliziten Pilot-Consent-Flow:

```text
cloud_control_auth_request
        |
        | services_reply bestätigt nur die Annahme des Requests
        v
Popup auf RC Plus 2
        |
        v
cloud_control_auth_notify
  status = ok | failed | canceled
```

Erst `cloud_control_auth_notify.data.output.status = "ok"` gilt für FH-Clone
als positive Pilot-Freigabe.

Die RC-Eigenschaft `cloud_control_auth` wird zusätzlich als Liste der
erteilten Rechte ausgewertet. Für Flugsteuerung muss sie `"flight"`
enthalten.

Der Adapter kapselt diesen Ablauf in
`DjiPilotCloudAuthorityCoordinator.requestFlightAuthority()` inklusive:

- genau einer parallelen Anfrage pro Gateway
- Popup-Wartezustand
- Timeout
- denied/canceled
- `cloud_control_release`
- fail-closed Verhalten

`flight_authority_grab` bleibt ein Legacy-/Dock-Pfad und ist **nicht** der
primäre Pilot-Cloud-Authority-Flow für Matrice 4 + RC Plus 2.

DJI-Authority und FH2-Steuerhoheit sind getrennte Ebenen.

Historisch vorgesehene M4-Flug-DRC-Sitzungen würden folgende Guards benötigen;
die Runtime startet solche Stick-Sitzungen aktuell wegen der globalen Sperre nicht:

```text
Produkt-Capability
+ FC3
+ FH2 Control Lease
+ Pilot Consent / DJI Control Authority
+ drc_mode_enter
+ DRC-Relay
+ Dead-Man
```

DJI dokumentiert, dass DRC-Kommandos nicht pauschal an Flugsteuerungsrecht
gebunden sind. Das aktuelle `stick_control` benötigt dieses Recht jedoch
zwingend. FH2 aktiviert diesen manuellen Flugsteuerpfad unabhängig davon
projektweit nicht.

DJI dokumentiert M3E/M3T/M3TA im RC-Pro-Pilot-Cloud-Pfad als Payload-orientiert. FH2 V3 implementiert dafür derzeit keinen schreibenden Payload-Command-Pfad. M3M wird separat über MSDK/WPML/Media betrachtet und erhält kein automatisch abgeleitetes Pilot-Cloud-Control-Profil.

## DRC-Kommandoklassen und Sequenzen

DJI verwendet je nach Protokoll unterschiedliche Sequenzpositionen.

### Aktuelles Pilot-`stick_control`

`seq` liegt auf Envelope-Ebene, also auf derselben Ebene wie `method` und
`data`.

```json
{
  "seq": 1,
  "method": "stick_control",
  "data": {
    "roll": 1024,
    "pitch": 1024,
    "throttle": 1024,
    "yaw": 1024
  }
}
```

### Legacy-`drone_control`

Beim Velocity-Protokoll mit `x/y/h/w` liegt `seq` **innerhalb von
`data`**.

```json
{
  "method": "drone_control",
  "data": {
    "seq": 1,
    "x": 0,
    "y": 0,
    "h": 0,
    "w": 0
  }
}
```

Diese beiden Formate dürfen nicht vereinheitlicht werden.

## Stick-Control

Der aktuelle Pilot-Stick-Pfad verwendet:

```text
Topic: thing/product/{gateway_sn}/drc/down
Methode: stick_control
```

Kanalwerte:

| Feld | Bereich | Neutral |
| --- | ---: | ---: |
| `roll` | 364..1684 | 1024 |
| `pitch` | 364..1684 | 1024 |
| `throttle` | 364..1684 | 1024 |
| `yaw` | 364..1684 | 1024 |

Die Weboberfläche darf diese Werte nicht direkt an MQTT publizieren.

## Legacy-Steuerpfad

`drone_control` mit `x/y/h/w` bleibt nur als expliziter
Kompatibilitätspfad.

Er darf nicht automatisch für neuere Pilot-/Matrice-4-Profile verwendet
werden.

## DRC-Sitzungszustandsmaschine

Im DJI-Adapter ist eine explizite Runtime-Zustandsmaschine implementiert:

```text
idle
  -> requesting
  -> authorized
  -> authority_grabbed
  -> drc_mode_active
  -> controlling
  -> degraded
  -> draining
  -> closed
       |
       +-> requesting
```

Zulässige Übergänge:

```text
idle              -> requesting
requesting        -> authorized | closed
authorized        -> authority_grabbed | closed
authority_grabbed -> drc_mode_active | draining | closed
drc_mode_active   -> controlling | draining | closed
controlling       -> degraded | draining | closed
degraded          -> controlling | draining | closed
draining          -> closed
closed            -> requesting
```

Damit existieren neun explizite Zustände:

- `idle`
- `requesting`
- `authorized`
- `authority_grabbed`
- `drc_mode_active`
- `controlling`
- `degraded`
- `draining`
- `closed`

Zusätzlich führt die Session einen Gesundheitsstatus
`healthy | degraded`.

Jede Runtime-Sitzung besitzt eine eigene `sessionId`. Diese ID dient Audit
und Korrelation und wird nach einem Prozessneustart **nicht** als
Autorisierungszustand rehydriert.

## Guards

Für den Übergang nach `requesting` werden geprüft:

- FC3
- gültiger Control Lease
- passende Capability

Für die Aktivierung wird zusätzlich DJI Authority verlangt.

Diese Trennung ermöglicht, dass die Authority während `requesting` erst
angefordert und bestätigt werden kann.

## Dead-Man

Standardwerte der lokalen FH2-Sicherheitsrichtlinie:

```text
nach 500 ms ohne neuen Stick-Input:
  state = active
  health = degraded

nach 2000 ms ohne neuen Stick-Input:
  active -> draining -> closed
```

Diese Werte sind **keine DJI-Protokollkonstanten**.

## Guard-Verlust

### DJI Authority geht verloren

Sofortiges Schließen ohne erzwungenen Neutral-Publish, weil die
Kommandoberechtigung bereits verloren sein kann.

### FC3, Lease oder Capability gehen verloren

Wenn DJI Authority noch besteht, wird die Sitzung geordnet über
`draining` beendet.

## Geordnetes Sitzungsende

Der normale Ablauf versucht:

1. Timer stoppen
2. Zustand `draining`
3. neutralen Stick senden
4. Heartbeat stoppen
5. `drc_mode_exit`
6. Zustand `closed`

Es wird **kein automatisches RTH** ausgelöst.

## Sitzungsdaten

Die Zustandsmaschine verwendet die Schnittstelle `DrcSessionStore`.

Aktuell vorhanden:

- `InMemoryDrcSessionStore`

Für V3 ist entscheidend:

- aktive DRC-Rechte stammen ausschließlich aus dem aktuellen Runtime-Zustand,
- PostgreSQL/TimescaleDB ist keine Quelle für aktive Control-Rechte,
- ein Prozessneustart rehydriert keine DRC-Sitzung,
- gespeicherte Auditdaten dürfen keine Sitzung wieder aktivieren.

Ein späterer Mehrinstanzbetrieb würde einen explizit dafür freigegebenen
gemeinsamen Runtime-Store benötigen. Eine konkrete Redis-Abhängigkeit ist für
V3 nicht festgelegt.

## Audit

Interne Audit-Ereignisse:

```text
requesting
activated
degraded
input
draining
neutral_sent
transport_lost
transport_recovered
closed
force_closed
```

Jedes Ereignis trägt die Runtime-`sessionId`, Gateway-SN und Aircraft-SN.

Diese Ereignisse sind interne FH2-Auditdaten.

Es wird kein erfundenes `drc_session_closed`-Kommando an DJI gesendet.

## Heartbeat

Beim aktuellen Pilot-Remote-Control-Protokoll liegt die Heartbeat-`seq`
ebenfalls auf Envelope-Ebene:

```json
{
  "seq": 1,
  "method": "heart_beat",
  "data": {
    "timestamp": 1670415891013
  }
}
```

Der DRC-Controller kann während einer aktiven Sitzung Heartbeats senden.

Der FH2-Dead-Man ist bewusst strenger und unabhängig vom
herstellerseitigen Verbindungs-Timeout.

## Emergency Stop

`drone_emergency_stop` ist ein FC3-Vorgang.

Die lokale Nachsperre nach einem Emergency Stop ist eine FH2-Sicherheitsregel
und keine allgemeine DJI-Protokollkonstante.

## FlyTo und weitere Flugfunktionen

`fly_to_point` ist in FH2 V3 im `DrcController` implementiert und läuft
über den Servicekanal.

DJI dokumentiert für Matrice 4 zusätzlich unter anderem RTH, Pointing/POI und
Orbit. Diese Pfade sind in FH2 V3 **nicht implementiert** und werden deshalb
runtime-seitig nicht als ausführbare Capabilities gemeldet.

Vorhandene M4-Steuerpfade benötigen weiterhin das passende Produktprofil sowie
die zentralen FC3-/Lease-/Authority-/Session-Prüfungen.

## V3-Abnahme

Vor einer produktiven FC3-Freigabe müssen getestet sein:

- reale Produktunterstützung
- Control Lease
- DJI Authority
- DRC-Mode-Enter
- Relay-Verbindung
- Heartbeat
- Stick-Taktung
- Dead-Man
- Guard-Verlust
- geordnetes Neutralisieren
- Sitzungsende
- Broker-Deny außerhalb der Sitzung
- Kill Switch
- Audit
- Prozess-Shutdown mit offenen Sitzungen

## Referenzen

Herstellerlinks und verifizierte Versionsstände stehen in
[COMPATIBILITY.md](COMPATIBILITY.md).


## Global deaktivierte DRC-/Dock-Pfade

Seit dem V3.0-Policy-Update sind DJI Dock 1, Dock 2, Dock 3 und Multi-Dock
projektweit deaktiviert. Es existiert deshalb kein aktives
`dock-velocity`-DRC-Profil mehr.

PSDK-bezogene DRC-Methoden (`drc_psdk_*`) sind ebenfalls global gesperrt.
Diese Sperren besitzen keinen Runtime-Schalter und können nicht über
Umgebungsvariablen aktiviert werden.


## Cloud-Control-Policy

FH2 erlaubt wieder beide DJI-DRC-Steuerpfade, aber ausschließlich hinter den
Produkt-/Gateway- und Safety-Gates:

```text
stick_control  = ENABLED
drone_control  = ENABLED
```

Für Matrice 4 + RC Plus 2 gilt damit wieder `flightControl=true` und
`DjiDrcProfile=pilot-m4-stick`. M3E/M3T/M3TA bleiben ohne Cloud-
Flugsteuerungsprofil.

Beide Pfade bleiben an FC3, Control Lease, DJI Control Authority, aktive
DRC-Sitzung und Dead-Man gebunden. Das Aktivieren des globalen Stick-Schalters
hebt diese Guards nicht auf.

`fly_to_point` bleibt als eigener Servicepfad davon unabhängig.

