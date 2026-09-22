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

Der Adapter unterstützt unter anderem:

```text
cloud_control_auth_request
cloud_control_release
```

DJI-Authority und FH2-Steuerhoheit sind getrennte Ebenen.

Für eine aktive DRC-Sitzung werden benötigt:

```text
Produkt-Capability
+ FC3
+ FH2 Control Lease
+ DJI Control Authority
+ drc_mode_enter
+ DRC-Relay
+ Dead-Man
```

## Stick-Control

Der aktuelle Stick-Pfad verwendet:

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
