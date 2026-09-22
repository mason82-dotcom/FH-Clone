# DJI Direct Remote Control (DRC)

## Sicherheitsstatus

DRC-Code ist auf `main` vorhanden, bleibt aber standardmäßig gesperrt.

```text
Safety Stage = FC0
DRC = nicht freigegeben
```

Der EMQX-Authorizer ist derzeit absichtlich so verdrahtet, dass
`isDrcGatewayActive()` immer `false` liefert. Damit besitzt der Broker im
aktuellen Stand keine dynamisch aktive DRC-Sitzung.

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

Diese Topics stehen nicht in der permanenten Basic-Link-ACL.

## Produktprofile

Der DJI-Adapter unterscheidet produktspezifische DRC-Profile, zum Beispiel:

```ts
type DjiDrcProfile =
  | "none"
  | "pilot-m3-payload"
  | "pilot-m4-stick"
  | "dock-velocity";
```

Die Auswahl basiert auf Topologie und bestätigten Produktfähigkeiten.

### Mavic 3 Enterprise + RC Pro Enterprise

Keine automatische `control.flight`-Capability.

Payload-, Kamera- und Gimbal-Funktionen werden separat bewertet.

### Matrice 4 + RC Plus 2

Für diesen Pfad existieren Stick-Control- und Cloud-Control-Authority-
Bausteine.

Auch hier aktiviert Produktunterstützung niemals automatisch FC3.

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

Für eine aktive M4-Flug-DRC-Sitzung werden benötigt:

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
zwingend. FH-Clone bleibt für M4-Flugsteuerung deshalb strikt
authority-gated.

M3E/M3T/M3M bleiben im Pilot-Cloud-Profil auf Payload-Control begrenzt.

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

Im DJI-Adapter ist eine serverseitige Zustandsmaschine implementiert:

```text
idle / closed
      |
      | FC3 + Lease + Capability
      v
requesting
      |
      | DJI Authority bestätigt
      v
active
      |
      | Bedienende beendet / Dead-Man / Guard-Verlust
      v
draining
      |
      | Neutral-Stick + drc_mode_exit
      v
closed
```

Es gibt fünf Zustände:

- `idle`
- `requesting`
- `active`
- `draining`
- `closed`

`degraded` ist kein sechster Zustand, sondern ein Gesundheitsstatus einer
weiterhin aktiven Sitzung.

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

Für einen mehrinstanzfähigen V3-Betrieb ist ein gemeinsamer persistenter oder
verteilter Store erforderlich. Eine konkrete Redis-Abhängigkeit ist **nicht**
verbindlich festgelegt.

## Audit

Interne Audit-Ereignisse:

```text
requesting
activated
degraded
input
draining
neutral_sent
closed
force_closed
```

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

`fly_to_point` läuft über den Servicekanal.

FlyTo, Pointing, Orbit oder andere Flugfunktionen benötigen das passende
Produktprofil sowie die zentralen Safety-/Authority-Prüfungen.

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
