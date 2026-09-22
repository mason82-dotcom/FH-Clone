# DJI Direct Remote Control (DRC)

## Sicherheitsstatus

DRC-Code ist auf `main` vorhanden, aber V3 aktiviert ihn nicht automatisch.

Standard:

```text
Safety Stage = FC0
DRC = gesperrt
```

DRC ist **kein Bestandteil des permanenten Basic Link**.

## Zwei getrennte MQTT-Pfade

`drc_mode_enter` läuft über den normalen Servicekanal und liefert die Daten
für die DRC-Sitzung.

FH-Clone trennt deshalb:

1. **Basic-Link-Servicekanal**
   - `services`
   - `services_reply`
   - Status/Telemetrie/Events
2. **DRC-Relay**
   - `drc/down`
   - `drc/up`
   - Heartbeat
   - Steuerframes

Beide können technisch auf derselben Brokerinstanz laufen, gelten
sicherheitstechnisch aber als getrennte Sitzungen.

## Topic-Richtung

Während einer aktiven DRC-Sitzung:

```text
Cloud -> Gateway:
thing/product/{gateway_sn}/drc/down

Gateway -> Cloud:
thing/product/{gateway_sn}/drc/up
```

DRC-Topics stehen nicht in der permanenten Basic-Link-ACL.

## Produktprofile

Der Adapter führt produktspezifische Profile, zum Beispiel:

```ts
type DjiDrcProfile =
  | "none"
  | "pilot-m3-payload"
  | "pilot-m4-stick"
  | "dock-velocity";
```

Das Profil stammt aus der erkannten Gateway-/Aircraft-Topologie und den
verifizierten Produktfähigkeiten.

### Mavic 3 Enterprise + RC Pro Enterprise

Für die Mavic-3-Enterprise-Familie wird keine automatische
`control.flight`-Capability vergeben.

Payload-, Kamera- und Gimbal-Funktionen sind davon getrennt zu bewerten.

### Matrice 4 + RC Plus 2

Für Matrice 4 existiert ein Pilot-Cloud-Control-Profil mit Stick-Control-Code.

Auch hier gilt: Produktunterstützung bedeutet nicht Safety-Freigabe.

## Cloud-Control-Authority

Aktuelle Pilot-Cloud-Pfade verwenden eine eigene DJI-Control-Authority.

Der Adapter unterstützt dafür unter anderem:

```text
cloud_control_auth_request
cloud_control_release
```

Authority-Status wird separat verfolgt.

DJI-Authority ersetzt **nicht** FH2-Control-Lease oder SafetyGate.

## Aktivierungskette

Eine aktive DRC-Steuerung benötigt vollständig:

```text
Produkt unterstützt Cloud Flight Control
+ FC3
+ gültiger FH2 Control Lease
+ gültige DJI Control Authority
+ drc_mode_enter erfolgreich
+ DRC Relay verbunden
+ Dead-Man aktiv
```

Fehlt ein Glied, darf kein Steuerframe gesendet werden.

## Stick-Control

Der aktuelle Stick-Pfad verwendet:

```text
Topic: thing/product/{gateway_sn}/drc/down
Methode: stick_control
```

Im Adapter vorhandene Kanalwerte:

| Feld | Bereich | Neutral |
| --- | ---: | ---: |
| `roll` | 364..1684 | 1024 |
| `pitch` | 364..1684 | 1024 |
| `throttle` | 364..1684 | 1024 |
| `yaw` | 364..1684 | 1024 |

Normierte UI-Werte werden vor dem Versand in diese Kanalwerte umgerechnet.

Der Browser publiziert niemals selbst MQTT-Steuerframes.

## Legacy-Pfad

`drone_control` mit `x/y/h/w` bleibt nur als expliziter
Kompatibilitätspfad im Adapter.

Er darf nicht automatisch für neuere Pilot-/Matrice-4-Profile verwendet
werden.

## Sequenzen und Taktung

Der Stick-Pfad führt eine eigene Sequenz. Bei neuer DRC-Sitzung wird der
Sitzungszustand zurückgesetzt.

Steuerdaten müssen während aktiver Steuerung in der vom Produktvertrag
vorgesehenen Frequenz gesendet werden. Ein einzelnes Stick-Paket ist keine
dauerhafte Steuerung.

## Heartbeat

FH-Clone kann während einer aktiven DRC-Sitzung Heartbeats senden.

Der Dead-Man der Anwendung darf strenger reagieren als ein DJI-seitiger
Verbindungs-Timeout.

## Dead-Man

Der V3-Code enthält einen DRC-Sitzungsmanager mit Dead-Man-Logik.

Der Dead-Man ist ein zusätzlicher FH2-Sicherheitsmechanismus und ersetzt weder
DJI Authority noch Broker-AuthZ.

Bei ausbleibender Bedienaktivität muss die lokale Sitzung in einen sicheren
Zustand wechseln.

## Emergency Stop

`drone_emergency_stop` ist ein FC3-Vorgang.

Der Adapter besitzt nach einem Emergency Stop zusätzlich eine lokale
Sperrzeit. Diese Sperrzeit ist eine FH2-Sicherheitsrichtlinie und keine
allgemeine DJI-Protokollkonstante.

Emergency-Kommandos müssen separat auditiert werden.

## FlyTo und weitere Flugfunktionen

`fly_to_point` läuft über den Servicekanal, nicht über dauerhaftes
Basic-Link-DRC.

Flugfunktionen wie FlyTo, Pointing oder Orbit dürfen nur über das passende
Produktprofil, SafetyGate und Control Authority freigegeben werden.

## Freigabe vor V3

Vor einer produktiven FC3-Freigabe müssen mindestens getestet sein:

- reale Produktunterstützung
- Authority-Anforderung und -Freigabe
- DRC-Mode-Enter
- Relay-Verbindung
- Heartbeat
- Stick-Taktung
- Dead-Man
- neutraler Zustand bei Sitzungsende
- Broker-Deny außerhalb der Sitzung
- Kill Switch
- Audit

## Referenzen

Die Herstellerlinks und verifizierten Versionsstände werden zentral in
[COMPATIBILITY.md](COMPATIBILITY.md) gepflegt.


## Session-State-Machine

FH-Clone führt DRC als serverseitige Zustandsmaschine:

```text
idle / closed
     |
     | FC3 + Lease + Capability
     v
requesting
     |
     | DJI Cloud-Control-Authority bestätigt
     v
active
     |
     | Operator-Close / Dead-man 2s / Lease- oder Capability-Verlust
     v
draining
     |
     | Neutral-Stick -> drc_mode_exit
     v
closed
```

`degraded` ist bewusst **kein sechster State**, sondern ein Health-Flag auf
einer weiterhin aktiven Session.

- nach 500 ms ohne neuen Stick-Input: `state=active`, `health=degraded`
- nach 2 s ohne Input: `active -> draining -> closed`
- DJI-Authority-Verlust: sofort `-> closed`, ohne erzwungenen Neutral-Publish
- kein automatisches RTH

Die Schwellen 500 ms und 2 s sind lokale FH-Clone-Safety-Policy und keine
DJI-Protokollkonstanten.

### Guards

Für `requesting` werden verlangt:

- FC3
- aktiver FH-Clone Control Lease
- passende Runtime-Capability

DJI-Authority wird erst für `requesting -> active` verlangt. Dadurch kann die
Authority im Requesting-State überhaupt erst am RC angefordert und bestätigt
werden.

### Persistenz

Die State-Machine hängt an einem `DrcSessionStore`-Interface. Der aktuelle
In-Memory-Store ist nur Referenz/Single-Instance-Fallback. Für mehrere
Control-API-Instanzen wird ein gemeinsamer Redis-Store mit TTL verwendet.

Der EMQX-Authorizer ist bereits asynchron ausgelegt, sodass
`isDrcGatewayActive(gatewaySn)` später direkt den externen Store abfragen
kann.

### Audit

Session-Kanten werden intern auditiert:

- requesting
- activated
- degraded
- input
- draining
- neutral_sent
- closed / force_closed

Es wird **kein** erfundenes `drc_session_closed`-Kommando an DJI publiziert.
Die Close-Kante gehört in das interne Audit-Log, nicht in das DJI-Protokoll.
